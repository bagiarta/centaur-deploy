import express from 'express';
import { poolPromise } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import sql from 'mssql';

const router = express.Router();

// Get all USB policies
router.get('/policies', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT p.*, d.ip 
            FROM UsbPolicies p
            LEFT JOIN Devices d ON p.target_type = 'device' AND p.target_id = d.hostname
            ORDER BY p.updated_at DESC
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error('Error fetching USB policies:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create or Update a USB policy
router.post('/policies', async (req, res) => {
    const { target_type, target_id, action, created_by } = req.body;
    
    if (!target_type || !target_id || !action) {
        return res.status(400).json({ error: 'Missing required fields: target_type, target_id, action' });
    }

    try {
        const pool = await poolPromise;
        
        // Check if policy already exists for this target
        const existing = await pool.request()
            .input('target_type', sql.NVARCHAR, target_type)
            .input('target_id', sql.NVARCHAR, target_id)
            .query(`SELECT id FROM UsbPolicies WHERE target_type = @target_type AND target_id = @target_id`);

        if (existing.recordset.length > 0) {
            // Update
            const id = existing.recordset[0].id;
            await pool.request()
                .input('id', sql.NVARCHAR, id)
                .input('action', sql.NVARCHAR, action)
                .input('updated_at', sql.DATETIME, new Date())
                .query(`UPDATE UsbPolicies SET action = @action, updated_at = @updated_at WHERE id = @id`);
            res.json({ message: 'Policy updated successfully', id });
        } else {
            // Insert
            const id = `usbpol-${uuidv4()}`;
            await pool.request()
                .input('id', sql.NVARCHAR, id)
                .input('target_type', sql.NVARCHAR, target_type)
                .input('target_id', sql.NVARCHAR, target_id)
                .input('action', sql.NVARCHAR, action)
                .input('created_by', sql.NVARCHAR, created_by || 'system')
                .query(`
                    INSERT INTO UsbPolicies (id, target_type, target_id, action, created_by)
                    VALUES (@id, @target_type, @target_id, @action, @created_by)
                `);
            res.status(201).json({ message: 'Policy created successfully', id });
        }
    } catch (error) {
        console.error('Error saving USB policy:', error);
        res.status(500).json({ error: error.message });
    }
});

// Evaluate policy for a specific device
router.get('/policies/evaluate', async (req, res) => {
    const { hostname } = req.query;
    if (!hostname) {
        return res.status(400).json({ error: 'Hostname is required' });
    }

    try {
        const pool = await poolPromise;
        
        // Find device groups if device exists
        const deviceResult = await pool.request()
            .input('hostname', sql.NVARCHAR, hostname)
            .query('SELECT group_ids FROM Devices WHERE hostname = @hostname');
        
        let groupIds = [];
        if (deviceResult.recordset.length > 0 && deviceResult.recordset[0].group_ids) {
            groupIds = deviceResult.recordset[0].group_ids.split(',').filter(id => id.trim() !== '');
        }

        // Fetch all policies
        const policiesResult = await pool.request().query('SELECT * FROM UsbPolicies');
        const policies = policiesResult.recordset;

        // 1. Check device-specific policy first (highest priority)
        const devicePolicy = policies.find(p => p.target_type === 'device' && p.target_id === hostname);
        if (devicePolicy) {
            return res.json({ action: devicePolicy.action, source: 'device' });
        }

        let appliedAction = 'allow'; // default

        // 2. Check group-specific policies
        if (groupIds.length > 0) {
            const groupPolicy = policies.find(p => p.target_type === 'group' && groupIds.includes(p.target_id));
            if (groupPolicy) {
                appliedAction = groupPolicy.action;
            }
        }

        // 3. Check global policy if no group policy
        if (appliedAction === 'allow') {
            const globalPolicy = policies.find(p => p.target_type === 'global');
            if (globalPolicy) {
                appliedAction = globalPolicy.action;
            }
        }

        // 4. Auto-register device policy
        const newId = `usbpol-${uuidv4()}`;
        try {
            await pool.request()
                .input('id', sql.NVARCHAR, newId)
                .input('target_type', sql.NVARCHAR, 'device')
                .input('target_id', sql.NVARCHAR, hostname)
                .input('action', sql.NVARCHAR, appliedAction)
                .input('created_by', sql.NVARCHAR, 'auto-registered')
                .query(`
                    INSERT INTO UsbPolicies (id, target_type, target_id, action, created_by)
                    VALUES (@id, @target_type, @target_id, @action, @created_by)
                `);
        } catch (e) {
            console.error('Failed to auto-register policy:', e);
        }

        res.json({ action: appliedAction, source: 'auto-registered' });
    } catch (error) {
        console.error('Error evaluating USB policy:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete a USB policy
router.delete('/policies/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.NVARCHAR, req.params.id)
            .query('DELETE FROM UsbPolicies WHERE id = @id');
        res.json({ message: 'Policy deleted successfully' });
    } catch (error) {
        console.error('Error deleting USB policy:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get USB events/logs
router.get('/events', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TOP 100 
                id, event_id, device_id, hostname, vendor_id, product_id, 
                serial_number, manufacturer, product_name, action_taken, 
                CONVERT(varchar, timestamp, 120) AS formatted_time
            FROM UsbEvents 
            ORDER BY timestamp DESC
        `);
        const data = result.recordset.map(r => ({
            ...r,
            timestamp: r.formatted_time
        }));
        res.json(data);
    } catch (error) {
        console.error('Error fetching USB events:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook for Agents to report USB events
router.post('/webhook', async (req, res) => {
    const {
        event_id, device_id, hostname, 
        device_details, action_taken
    } = req.body;

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('event_id', sql.NVARCHAR, event_id || uuidv4())
            .input('device_id', sql.NVARCHAR, device_id || 'unknown')
            .input('hostname', sql.NVARCHAR, hostname || 'unknown')
            .input('vendor_id', sql.NVARCHAR, device_details?.vendor_id || '')
            .input('product_id', sql.NVARCHAR, device_details?.product_id || '')
            .input('serial_number', sql.NVARCHAR, device_details?.serial_number || '')
            .input('manufacturer', sql.NVARCHAR, device_details?.manufacturer || '')
            .input('product_name', sql.NVARCHAR, device_details?.product_name || '')
            .input('action_taken', sql.NVARCHAR, action_taken || 'UNKNOWN')
            .query(`
                INSERT INTO UsbEvents (
                    event_id, device_id, hostname, vendor_id, product_id, 
                    serial_number, manufacturer, product_name, action_taken
                ) VALUES (
                    @event_id, @device_id, @hostname, @vendor_id, @product_id, 
                    @serial_number, @manufacturer, @product_name, @action_taken
                )
            `);
        
        // Broadcast via Socket.IO if needed here

        res.status(201).json({ message: 'Event logged successfully' });
    } catch (error) {
        console.error('Error logging USB event:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
