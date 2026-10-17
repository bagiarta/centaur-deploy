import sql from 'mssql';
import { poolPromise, initDb } from '../config/db.js';
import { getH2hToken, h2hConfig, requestH2hJson } from '../config/h2h.js';

const H2H_POINT_KEYS = new Set([
    'current_points', 'latest_point', 'point', 'points', 'point_balance',
    'points_balance', 'balance_points', 'available_points', 'total_points',
    'currentpoint', 'currentpoints', 'latestpoint', 'latestpoints', 'pointbalance', 'pointsbalance',
    'loyaltypoint', 'loyaltypoints', 'totalpoint', 'totalpoints', 'redeem', 'redeem_points'
]);

function findH2hPoints(value) {
    if (!value || typeof value !== 'object') return null;

    for (const [key, rawValue] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (H2H_POINT_KEYS.has(key.toLowerCase()) || H2H_POINT_KEYS.has(normalizedKey)) {
            const points = Number(rawValue);
            if (Number.isFinite(points)) return points;
        }
    }

    for (const nestedValue of Object.values(value)) {
        const points = findH2hPoints(nestedValue);
        if (points !== null) return points;
    }
    return null;
}

const H2H_EXPENSE_KEYS = new Set([
    'totalexpense', 'expense', 'totalspend', 'totalspent', 'totalpurchase', 'totalpurchaseamount'
]);
const H2H_LUCKY_DRAW_KEYS = new Set([
    'luckydraw', 'luckydrawpoint', 'luckydrawpoints', 'lucky_draw', 'lucky_draw_point', 'lucky_draw_points'
]);

function findH2hMetric(value, keys) {
    if (!value || typeof value !== 'object') return null;

    for (const [key, rawValue] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (keys.has(normalizedKey)) {
            const metric = Number(rawValue);
            if (Number.isFinite(metric)) return metric;
        }
    }

    for (const nestedValue of Object.values(value)) {
        const metric = findH2hMetric(nestedValue, keys);
        if (metric !== null) return metric;
    }
    return null;
}

async function getH2hMemberData(memberIdentifier) {
    if (!h2hConfig.baseUrl || !memberIdentifier) {
        throw new Error('Konfigurasi H2H atau nomor member tidak tersedia.');
    }

    const token = await getH2hToken();
    const query = new URLSearchParams({ client_code: h2hConfig.clientCode || '' });
    const response = await requestH2hJson(
        `${h2hConfig.baseUrl}/api/v1/tenant/customer/${encodeURIComponent(memberIdentifier)}?${query}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );

    const data = response.data || {};
    if (response.status < 200 || response.status >= 300) {
        throw new Error(data.message || `H2H API Error: ${response.status}`);
    }

    return data?.data || data;
}

async function getH2hMemberPoints(memberIdentifier) {
    const memberData = await getH2hMemberData(memberIdentifier);
    const points = findH2hPoints(memberData);
    if (points === null) {
        const responseKeys = Object.keys(memberData).join(', ');
        throw new Error(`Saldo point tidak ditemukan pada response H2H. Field response: ${responseKeys || '(kosong)'}`);
    }
    return points;
}

async function getH2hMemberSnapshot(memberIdentifier) {
    const memberData = await getH2hMemberData(memberIdentifier);
    const currentPoints = findH2hPoints(memberData);
    if (currentPoints === null) {
        const responseKeys = Object.keys(memberData || {}).join(', ');
        throw new Error(`Saldo point tidak ditemukan pada response H2H. Field response: ${responseKeys || '(kosong)'}`);
    }

    const point = memberData?.point || {};
    return {
        customer_name: memberData?.name || memberData?.customer_name || '',
        card_no: memberData?.card_no || memberData?.card_number || memberData?.member_id || memberData?.barcode || memberData?.code || '',
        mobile_no: memberData?.phone?.mobile || memberData?.mobile_no || memberData?.mobile || '',
        email: memberData?.email || '',
        tier_name: memberData?.card_type?.name || memberData?.tier_name || '',
        current_points: currentPoints,
        total_expense: findH2hMetric(memberData, H2H_EXPENSE_KEYS) ?? Number(memberData?.total_expense || 0),
        lucky_draw_points: findH2hMetric(point, H2H_LUCKY_DRAW_KEYS) ?? 0,
        h2h_checked_at: new Date().toISOString()
    };
}

function getH2hFieldValue(memberData, fieldName) {
    const fieldMap = {
        customer_name: memberData?.name,
        mobile_no: memberData?.phone?.mobile,
        email: memberData?.email,
        address: memberData?.address?.address,
        city: memberData?.address?.city?.name || memberData?.address?.city,
        district: memberData?.address?.district?.name || memberData?.address?.district,
        dob: memberData?.birth_date,
        gender: memberData?.gender
    };

    if (!Object.prototype.hasOwnProperty.call(fieldMap, fieldName)) {
        throw new Error(`Field ${fieldName} belum memiliki mapping ke response H2H.`);
    }
    return fieldMap[fieldName];
}

function normalizeValue(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

// Primary Pool for Ticket storage and workflow in DBWH_8529
async function getTicketPool() {
  await initDb();
  return await poolPromise;
}

// Pool for Customer Lookup in DBWH_8555 (with fallback to DBWH_8529)
let lookupPool = null;
async function getCustomerLookupPool() {
  if (lookupPool) return lookupPool;
  try {
    const pool = new sql.ConnectionPool({
      user: process.env.CRM_DB_USER || 'DBWH_8555',
      password: process.env.CRM_DB_PASS || 'DBWH_8555',
      server: process.env.CRM_DB_SERVER || '192.168.85.55',
      database: process.env.CRM_DB_NAME || 'DBWH_8555',
      options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
      connectionTimeout: 10000, requestTimeout: 30000
    });
    lookupPool = await pool.connect();
    return lookupPool;
  } catch (err) {
    console.warn("Could not connect to DBWH_8555 for customer lookup, falling back to local pool:", err.message);
    return await getTicketPool();
  }
}

async function getHoServerPool() {
    const pool = await getTicketPool();
    const deviceRes = await pool.request()
        .input('hostname', sql.NVarChar, 'HOSERVER')
        .query('SELECT TOP 1 id, ip FROM Devices WHERE hostname = @hostname');
    if (deviceRes.recordset.length === 0) throw new Error('HOSERVER device not found.');

    const device = deviceRes.recordset[0];
    const connectionRes = await pool.request()
        .input('device_id', sql.NVarChar, device.id)
        .query('SELECT TOP 1 db_user, db_password, db_name FROM DeviceDbConnections WHERE device_id = @device_id');
    if (connectionRes.recordset.length === 0) throw new Error('HOSERVER database credentials not configured.');

    const connection = connectionRes.recordset[0];
    const hoPool = new sql.ConnectionPool({
        user: connection.db_user,
        password: connection.db_password,
        server: device.ip || '192.168.85.18',
        database: process.env.HO_DB_NAME || connection.db_name || 'pepito_ho',
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
        connectionTimeout: 10000,
        requestTimeout: 15000
    });
    await hoPool.connect();
    return hoPool;
}

async function logValidationFailure(pool, ticketId, executorId, executorName, details) {
    try {
        await pool.request()
            .input('ticket_id', sql.VarChar, ticketId)
            .input('action', sql.VarChar, 'VALIDATION_FAILED')
            .input('actor_id', sql.VarChar, executorId || 'SYSTEM')
            .input('actor_name', sql.VarChar, executorName || 'SYSTEM')
            .input('details', sql.NVarChar, details)
            .query(`
                INSERT INTO CRM_TICKET_AUDIT_LOGS
                (ticket_id, action, actor_id, actor_name, details)
                VALUES (@ticket_id, @action, @actor_id, @actor_name, @details)
            `);
    } catch (logError) {
        console.error('Failed to write validation audit log:', logError);
    }
}

// Generates unique Ticket ID: TKT-YYMMDD-XXX
async function generateTicketId(pool) {
    const today = new Date();
    const prefix = 'TKT-' + today.toISOString().slice(2, 10).replace(/-/g, '') + '-';
    
    const result = await pool.request()
        .input('prefix', sql.VarChar, prefix + '%')
        .query(`
            SELECT TOP 1 ticket_id FROM CRM_TICKETS 
            WHERE ticket_id LIKE @prefix 
            ORDER BY ticket_id DESC
        `);
    
    if (result.recordset.length > 0) {
        const lastId = result.recordset[0].ticket_id;
        const seq = parseInt(lastId.split('-')[2]) + 1;
        return prefix + seq.toString().padStart(3, '0');
    }
    return prefix + '001';
}

export const createTicket = async (req, res) => {
    const { 
        requester_id, requester_name, unit_branch, request_type, 
        priority, customer_id, customer_name, mobile_no, details 
    } = req.body;
    
    try {
        const pool = await getTicketPool();
        
        // Validate Billing Number (transaction_ref) uniqueness
        if (request_type === 'POINT_ADJUSTMENT' && details && details.length > 0) {
            for (let detail of details) {
                if (detail.transaction_ref) {
                    const checkRef = await pool.request()
                        .input('transaction_ref', sql.VarChar, detail.transaction_ref)
                        .query("SELECT COUNT(*) as count FROM CRM_TICKET_DETAILS WHERE transaction_ref = @transaction_ref");
                    if (checkRef.recordset[0].count > 0) {
                        return res.status(400).json({ error: `Nomor billing ${detail.transaction_ref} sudah pernah diajukan dalam tiket lain.` });
                    }
                }
            }
        }

        // Validate MERGE_POINTS requirements
        if (request_type === 'MERGE_POINTS') {
            if (!details || details.length === 0 || !details[0].transaction_ref) {
                return res.status(400).json({ error: 'Member Baru (Tujuan) wajib diisi untuk penggabungan poin.' });
            }
            if (customer_id === details[0].transaction_ref) {
                return res.status(400).json({ error: 'Member Lama dan Member Baru tidak boleh sama.' });
            }

            const previousMerge = await pool.request()
                .input('source_member', sql.VarChar, customer_id)
                .query(`
                    SELECT TOP 1 ticket_id, status
                    FROM CRM_TICKETS
                    WHERE customer_id = @source_member
                      AND request_type = 'MERGE_POINTS'
                    ORDER BY created_at DESC
                `);
            if (previousMerge.recordset.length > 0) {
                return res.status(409).json({
                    error: `Member sumber ${customer_id} sudah pernah diajukan dalam tiket Merge Points (${previousMerge.recordset[0].ticket_id}). Pengajuan ulang tidak diperbolehkan.`
                });
            }
        }

        let mergeH2hAtCreate = null;
        if (request_type === 'MERGE_POINTS') {
            try {
                const source = await getH2hMemberSnapshot(customer_id);
                const target = await getH2hMemberSnapshot(details[0].transaction_ref);
                mergeH2hAtCreate = { source, target, checked_at: new Date().toISOString() };
            } catch (h2hError) {
                console.error('Create merge H2H lookup failed:', h2hError);
                return res.status(502).json({
                    error: 'Data member merge points tidak dapat diverifikasi dari H2H.',
                    details: h2hError.message
                });
            }
        }

        const ticket_id = await generateTicketId(pool);
        
        // Start transaction
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
            // 1. Insert Ticket into DBWH_8529
            const reqTicket = new sql.Request(transaction);
            await reqTicket
                .input('ticket_id', sql.VarChar, ticket_id)
                .input('requester_id', sql.VarChar, requester_id)
                .input('requester_name', sql.VarChar, requester_name)
                .input('unit_branch', sql.VarChar, unit_branch)
                .input('request_type', sql.VarChar, request_type)
                .input('priority', sql.VarChar, priority || 'NORMAL')
                .input('customer_id', sql.VarChar, customer_id)
                .input('customer_name', sql.VarChar, customer_name || null)
                .input('mobile_no', sql.VarChar, mobile_no || null)
                .input('status', sql.VarChar, 'Pending Approval L1')
                .query(`
                    INSERT INTO CRM_TICKETS 
                    (ticket_id, requester_id, requester_name, unit_branch, request_type, priority, customer_id, customer_name, mobile_no, status, current_approval_level)
                    VALUES (@ticket_id, @requester_id, @requester_name, @unit_branch, @request_type, @priority, @customer_id, @customer_name, @mobile_no, @status, 1)
                `);

            // 2. Insert Details
            for (let detail of details) {
                const reqDetail = new sql.Request(transaction);
                await reqDetail
                    .input('ticket_id', sql.VarChar, ticket_id)
                    .input('field_name', sql.VarChar, detail.field_name)
                    .input('old_value', sql.VarChar, detail.old_value)
                    .input('new_value', sql.VarChar, detail.new_value)
                    .input('reason', sql.VarChar, detail.reason)
                    .input('transaction_ref', sql.VarChar, detail.transaction_ref || null)
                    .input('attachment_url', sql.VarChar, detail.attachment_url || null)
                    .query(`
                        INSERT INTO CRM_TICKET_DETAILS 
                        (ticket_id, field_name, old_value, new_value, reason, transaction_ref, attachment_url)
                        VALUES (@ticket_id, @field_name, @old_value, @new_value, @reason, @transaction_ref, @attachment_url)
                    `);
            }
            
            // 3. Audit Log
            const reqLog = new sql.Request(transaction);
            await reqLog
                .input('ticket_id', sql.VarChar, ticket_id)
                .input('action', sql.VarChar, 'CREATED')
                .input('actor_id', sql.VarChar, requester_id)
                .input('actor_name', sql.VarChar, requester_name)
                .input('details', sql.NVarChar, mergeH2hAtCreate
                    ? `Ticket created and submitted. H2H snapshot saat create: source points=${mergeH2hAtCreate.source.current_points}, expense=${mergeH2hAtCreate.source.total_expense}, lucky_draw=${mergeH2hAtCreate.source.lucky_draw_points}; target points=${mergeH2hAtCreate.target.current_points}, expense=${mergeH2hAtCreate.target.total_expense}, lucky_draw=${mergeH2hAtCreate.target.lucky_draw_points}; checked_at=${mergeH2hAtCreate.checked_at}`
                    : 'Ticket created and submitted.')
                .query(`
                    INSERT INTO CRM_TICKET_AUDIT_LOGS 
                    (ticket_id, action, actor_id, actor_name, details)
                    VALUES (@ticket_id, @action, @actor_id, @actor_name, @details)
                `);

            await transaction.commit();
            res.json({ success: true, ticket_id });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error("Create ticket error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const getTickets = async (req, res) => {
    try {
        const pool = await getTicketPool();
        const request = pool.request();
        let query = `
            SELECT t.*, 
                   (SELECT TOP 1 reason FROM CRM_TICKET_DETAILS d WHERE d.ticket_id = t.ticket_id) as reason 
            FROM CRM_TICKETS t 
            WHERE 1=1
        `;
        
        if (req.query.status) {
            query += " AND t.status = @status";
            request.input('status', sql.VarChar, req.query.status);
        }
        
        query += " ORDER BY t.created_at DESC";
        
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error("getTickets error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const getTicketById = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getTicketPool();
        const ticketRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query(`
                SELECT t.*, 
                       t.customer_id as card_no
                FROM CRM_TICKETS t
                WHERE t.ticket_id = @ticket_id
            `);
            
        if (ticketRes.recordset.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        
        const detailsRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKET_DETAILS WHERE ticket_id = @ticket_id");
            
        const approvalsRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKET_APPROVALS WHERE ticket_id = @ticket_id ORDER BY created_at ASC");
            
        const logsRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKET_AUDIT_LOGS WHERE ticket_id = @ticket_id ORDER BY created_at DESC");

        let mergeH2h = null;
        if (ticketRes.recordset[0].request_type === 'MERGE_POINTS' && detailsRes.recordset[0]) {
            const sourceIdentifier = ticketRes.recordset[0].customer_id;
            const targetIdentifier = detailsRes.recordset[0].transaction_ref;
            const [sourceResult, targetResult] = await Promise.allSettled([
                getH2hMemberSnapshot(sourceIdentifier),
                getH2hMemberSnapshot(targetIdentifier)
            ]);
            mergeH2h = {
                source: sourceResult.status === 'fulfilled' ? sourceResult.value : null,
                target: targetResult.status === 'fulfilled' ? targetResult.value : null,
                errors: {
                    source: sourceResult.status === 'rejected' ? sourceResult.reason?.message : null,
                    target: targetResult.status === 'rejected' ? targetResult.reason?.message : null
                },
                checked_at: new Date().toISOString()
            };
        }

        res.json({
            ticket: ticketRes.recordset[0],
            details: detailsRes.recordset,
            approvals: approvalsRes.recordset,
            logs: logsRes.recordset,
            merge_h2h: mergeH2h
        });
    } catch (err) {
        console.error("getTicketById error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const approveTicket = async (req, res) => {
    const { id } = req.params;
    const { approver_id, approver_name, approver_role, action, comments } = req.body;
    // action: 'APPROVE', 'REJECT', 'RETURN'
    
    try {
        const pool = await getTicketPool();
        const ticketRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKETS WHERE ticket_id = @ticket_id");
            
        if (ticketRes.recordset.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        
        let ticket = ticketRes.recordset[0];
        let newStatus = ticket.status;
        let newLevel = ticket.current_approval_level;

        if (action === 'REJECT') {
            newStatus = 'Rejected';
        } else if (action === 'RETURN') {
            newStatus = 'Need Information';
            newLevel = 0; // Return to requester/helpdesk
        } else if (action === 'APPROVE') {
            if (newLevel === 1) {
                newLevel = 2;
                newStatus = 'Pending Approval L2';
            } else if (newLevel === 2) {
                newLevel = 3;
                newStatus = 'Pending Approval L3';
            } else if (newLevel === 3) {
                newLevel = 4;
                newStatus = 'Approved';
            }
        }
        
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
            const reqUpdate = new sql.Request(transaction);
            await reqUpdate
                .input('ticket_id', sql.VarChar, id)
                .input('status', sql.VarChar, newStatus)
                .input('level', sql.Int, newLevel)
                .query(`
                    UPDATE CRM_TICKETS 
                    SET status = @status, current_approval_level = @level, updated_at = GETDATE()
                    WHERE ticket_id = @ticket_id
                `);
                
            const reqApp = new sql.Request(transaction);
            await reqApp
                .input('ticket_id', sql.VarChar, id)
                .input('approver_id', sql.VarChar, approver_id)
                .input('approver_name', sql.VarChar, approver_name)
                .input('approver_role', sql.VarChar, approver_role)
                .input('status', sql.VarChar, action)
                .input('comments', sql.NVarChar, comments || '')
                .query(`
                    INSERT INTO CRM_TICKET_APPROVALS 
                    (ticket_id, approver_id, approver_name, approver_role, status, comments)
                    VALUES (@ticket_id, @approver_id, @approver_name, @approver_role, @status, @comments)
                `);

            const reqLog = new sql.Request(transaction);
            await reqLog
                .input('ticket_id', sql.VarChar, id)
                .input('action', sql.VarChar, 'APPROVAL_' + action)
                .input('actor_id', sql.VarChar, approver_id)
                .input('actor_name', sql.VarChar, approver_name)
                .input('details', sql.NVarChar, `Action ${action} by ${approver_role}. Comments: ${comments}. New Status: ${newStatus}`)
                .query(`
                    INSERT INTO CRM_TICKET_AUDIT_LOGS 
                    (ticket_id, action, actor_id, actor_name, details)
                    VALUES (@ticket_id, @action, @actor_id, @actor_name, @details)
                `);

            await transaction.commit();
            res.json({ success: true, newStatus, newLevel });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error("Approve ticket error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const resubmitTicket = async (req, res) => {
    const { id } = req.params;
    const { requester_id, requester_name, notes, request_type, customer_name, mobile_no, details } = req.body;
    
    try {
        const pool = await getTicketPool();

        const currentTicket = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query('SELECT customer_id FROM CRM_TICKETS WHERE ticket_id = @ticket_id');
        if (currentTicket.recordset.length === 0) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        // Validate Billing Number (transaction_ref) uniqueness, excluding current ticket
        if (request_type === 'POINT_ADJUSTMENT' && details && details.length > 0) {
            for (let detail of details) {
                if (detail.transaction_ref) {
                    const checkRef = await pool.request()
                        .input('transaction_ref', sql.VarChar, detail.transaction_ref)
                        .input('current_ticket_id', sql.VarChar, id)
                        .query("SELECT COUNT(*) as count FROM CRM_TICKET_DETAILS WHERE transaction_ref = @transaction_ref AND ticket_id != @current_ticket_id");
                    if (checkRef.recordset[0].count > 0) {
                        return res.status(400).json({ error: `Nomor billing ${detail.transaction_ref} sudah pernah diajukan dalam tiket lain.` });
                    }
                }
            }
        }

        // Validate MERGE_POINTS requirements if resubmitting
        if (request_type === 'MERGE_POINTS') {
            if (!details || details.length === 0 || !details[0].transaction_ref) {
                return res.status(400).json({ error: 'Member Baru (Tujuan) wajib diisi untuk penggabungan poin.' });
            }

            const previousMerge = await pool.request()
                .input('source_member', sql.VarChar, currentTicket.recordset[0].customer_id)
                .input('current_ticket_id', sql.VarChar, id)
                .query(`
                    SELECT TOP 1 ticket_id, status
                    FROM CRM_TICKETS
                    WHERE customer_id = @source_member
                      AND request_type = 'MERGE_POINTS'
                      AND ticket_id <> @current_ticket_id
                    ORDER BY created_at DESC
                `);
            if (previousMerge.recordset.length > 0) {
                return res.status(409).json({
                    error: `Member sumber ${currentTicket.recordset[0].customer_id} sudah pernah diajukan dalam tiket Merge Points (${previousMerge.recordset[0].ticket_id}). Pengajuan ulang tidak diperbolehkan.`
                });
            }
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
            const reqUpdate = new sql.Request(transaction);
            await reqUpdate
                .input('ticket_id', sql.VarChar, id)
                .input('request_type', sql.VarChar, request_type)
                .query(`
                    UPDATE CRM_TICKETS 
                    SET status = 'Pending Approval L1', current_approval_level = 1, updated_at = GETDATE(), request_type = @request_type
                    WHERE ticket_id = @ticket_id
                `);

            if (customer_name || mobile_no) {
                await new sql.Request(transaction)
                    .input('ticket_id', sql.VarChar, id)
                    .input('customer_name', sql.VarChar, customer_name || null)
                    .input('mobile_no', sql.VarChar, mobile_no || null)
                    .query(`
                        UPDATE CRM_TICKETS 
                        SET customer_name = COALESCE(@customer_name, customer_name),
                            mobile_no = COALESCE(@mobile_no, mobile_no)
                        WHERE ticket_id = @ticket_id
                    `);
            }
            
            if (details && details.length > 0) {
                // Delete old details
                const reqDelDetails = new sql.Request(transaction);
                await reqDelDetails.input('ticket_id', sql.VarChar, id).query("DELETE FROM CRM_TICKET_DETAILS WHERE ticket_id = @ticket_id");

                // Insert new details
                for (let detail of details) {
                    const reqDetail = new sql.Request(transaction);
                    await reqDetail
                        .input('ticket_id', sql.VarChar, id)
                        .input('field_name', sql.VarChar, detail.field_name)
                        .input('old_value', sql.VarChar, detail.old_value)
                        .input('new_value', sql.VarChar, detail.new_value)
                        .input('reason', sql.VarChar, detail.reason)
                        .input('transaction_ref', sql.VarChar, detail.transaction_ref || null)
                        .input('attachment_url', sql.VarChar, detail.attachment_url || null)
                        .query(`
                            INSERT INTO CRM_TICKET_DETAILS 
                            (ticket_id, field_name, old_value, new_value, reason, transaction_ref, attachment_url)
                            VALUES (@ticket_id, @field_name, @old_value, @new_value, @reason, @transaction_ref, @attachment_url)
                        `);
                }
            }
                
            const reqLog = new sql.Request(transaction);
            await reqLog
                .input('ticket_id', sql.VarChar, id)
                .input('action', sql.VarChar, 'RESUBMITTED')
                .input('actor_id', sql.VarChar, requester_id)
                .input('actor_name', sql.VarChar, requester_name)
                .input('details', sql.NVarChar, `Resubmitted. Notes: ${notes}`)
                .query(`
                    INSERT INTO CRM_TICKET_AUDIT_LOGS 
                    (ticket_id, action, actor_id, actor_name, details)
                    VALUES (@ticket_id, @action, @actor_id, @actor_name, @details)
                `);

            await transaction.commit();
            res.json({ success: true, status: 'Pending Approval L1' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error("Resubmit ticket error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const executeTicket = async (req, res) => {
    const { id } = req.params;
    const { executor_id, executor_name, result_notes } = req.body;
    
    try {
        const pool = await getTicketPool();

        // 1. Fetch ticket and details
        const ticketRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKETS WHERE ticket_id = @ticket_id");
        
        if (ticketRes.recordset.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        const ticket = ticketRes.recordset[0];

        const detailsRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKET_DETAILS WHERE ticket_id = @ticket_id");
        const details = detailsRes.recordset;

        let executionNotes = `Executed. Notes: ${result_notes || '-'}`;

        // 2. Perform live customer updates based on request_type
        if (ticket.request_type === 'MERGE_POINTS' && details.length > 0) {
            const detail = details[0];
            const sourceCard = ticket.customer_id;
            const targetCard = detail.transaction_ref;
            const pts = Number(detail.new_value);

            if (!Number.isFinite(pts) || pts <= 0 || !targetCard) {
                const message = `Validasi merge points gagal: point sumber, point transfer, atau member tujuan tidak valid. source=${detail.old_value}, transfer=${detail.new_value}, target=${targetCard || '-'}`;
                await logValidationFailure(pool, id, executor_id, executor_name, message);
                return res.status(400).json({ error: message });
            }

            if (pts > 0 && targetCard) {
                let sourceH2h;
                let targetH2h;
                try {
                    // Read both members directly from H2H immediately before the local update.
                    sourceH2h = await getH2hMemberSnapshot(sourceCard);
                    targetH2h = await getH2hMemberSnapshot(targetCard);
                } catch (h2hError) {
                    console.error("H2H merge validation failed:", h2hError);
                    await logValidationFailure(
                        pool, id, executor_id, executor_name,
                        `MERGE_POINTS H2H validation error. Source=${sourceCard}, target=${targetCard}, transferred=${pts}, error=${h2hError.message}`
                    );
                    return res.status(502).json({
                        error: 'Validasi merge points ke H2H gagal. Update tidak dilakukan.',
                        details: h2hError.message
                    });
                }

                if (pts > sourceH2h.current_points) {
                    const message = `Validasi merge points gagal: point transfer (${pts}) melebihi point sumber H2H (${sourceH2h.current_points}). Source expense=${sourceH2h.total_expense}, source lucky draw=${sourceH2h.lucky_draw_points}.`;
                    await logValidationFailure(pool, id, executor_id, executor_name, message);
                    return res.status(409).json({
                        error: message,
                        validation: {
                            type: 'MERGE_POINTS_SOURCE_BALANCE',
                            source_member: sourceCard,
                            source_points: sourceH2h.current_points,
                            transferred_points: pts,
                            source_total_expense: sourceH2h.total_expense,
                            source_lucky_draw_points: sourceH2h.lucky_draw_points,
                            target_total_expense: targetH2h.total_expense,
                            target_lucky_draw_points: targetH2h.lucky_draw_points
                        }
                    });
                }

                if (targetH2h.current_points < pts) {
                    await logValidationFailure(
                        pool, id, executor_id, executor_name,
                        `MERGE_POINTS validation rejected. Source=${sourceCard}, target=${targetCard}, transferred=${pts}, target_h2h_points=${targetH2h.current_points}, target_total_expense=${targetH2h.total_expense}, target_lucky_draw_points=${targetH2h.lucky_draw_points}`
                    );
                    return res.status(409).json({
                        error: 'Validasi merge points gagal. Point member tujuan belum mencapai point yang ditransfer.',
                        validation: {
                            type: 'MERGE_POINTS',
                            source_member: sourceCard,
                            target_member: targetCard,
                            transferred_points: pts,
                            target_h2h_points: targetH2h.current_points,
                            source_h2h_points: sourceH2h.current_points,
                            source_total_expense: sourceH2h.total_expense,
                            source_lucky_draw_points: sourceH2h.lucky_draw_points,
                            target_total_expense: targetH2h.total_expense,
                            target_lucky_draw_points: targetH2h.lucky_draw_points
                        }
                    });
                }

                try {
                    const p55 = await getCustomerLookupPool();
                    // Deduct points from source member and DEACTIVATE old card
                    await p55.request()
                        .input('source', sql.VarChar, sourceCard)
                        .input('pts', sql.Int, pts)
                        .query(`
                            UPDATE RXL_LOYALID_CUSTOMER_MST
                            SET LATEST_POINT = CASE WHEN LATEST_POINT >= @pts THEN LATEST_POINT - @pts ELSE 0 END,
                                RLICM_STATUS = '0',
                                UPDATED_AT = GETDATE()
                            WHERE RLICM_CARD_NO = @source OR RLICM_MOBILE_NO = @source
                        `);

                    // Add points to target member
                    await p55.request()
                        .input('target', sql.VarChar, targetCard)
                        .input('pts', sql.Int, pts)
                        .query(`
                            UPDATE RXL_LOYALID_CUSTOMER_MST
                            SET LATEST_POINT = LATEST_POINT + @pts,
                                UPDATED_AT = GETDATE()
                            WHERE RLICM_CARD_NO = @target OR RLICM_MOBILE_NO = @target
                        `);

                    executionNotes = `Merge Points Berhasil: ${pts} poin dipindahkan dari ${sourceCard} ke ${targetCard}. Kartu lama ${sourceCard} telah dinonaktifkan (Status: Inactive). Validasi H2H: source ${sourceH2h.current_points} pts, target ${targetH2h.current_points} pts (minimum ${pts}). Source expense=${sourceH2h.total_expense}, source lucky draw=${sourceH2h.lucky_draw_points}; target expense=${targetH2h.total_expense}, target lucky draw=${targetH2h.lucky_draw_points}. Notes: ${result_notes || '-'}`;
                    executionNotes += ` H2H checked at ${new Date().toISOString()}.`;
                } catch (e55) {
                    console.error("Failed to execute Merge Points in DBWH_8555:", e55);
                    throw e55;
                }
            }
        } else if (ticket.request_type === 'POINT_ADJUSTMENT' && details.length > 0) {
            const detail = details[0];
            const initialPoints = Number(detail.old_value);
            const pts = Number(detail.new_value);
            if (!Number.isFinite(initialPoints) || !Number.isFinite(pts)) {
                await logValidationFailure(
                    pool, id, executor_id, executor_name,
                    `POINT_ADJUSTMENT validation rejected: invalid point values. initial=${detail.old_value}, adjustment=${detail.new_value}`
                );
                return res.status(400).json({ error: 'Nilai point awal atau adjustment tidak valid.' });
            }

            if (pts !== 0) {
                const memberIdentifier = ticket.mobile_no || ticket.customer_id;
                const expectedPoints = initialPoints + pts;
                let h2hPoints;

                try {
                    // Re-check immediately before changing the local customer master.
                    h2hPoints = await getH2hMemberPoints(memberIdentifier);
                } catch (h2hError) {
                    console.error("H2H point validation failed:", h2hError);
                    await logValidationFailure(
                        pool, id, executor_id, executor_name,
                        `POINT_ADJUSTMENT H2H validation error. Member=${memberIdentifier}, initial=${initialPoints}, adjustment=${pts}, error=${h2hError.message}`
                    );
                    return res.status(502).json({
                        error: 'Validasi point ke H2H gagal. Update tidak dilakukan.',
                        details: h2hError.message
                    });
                }

                if (h2hPoints < expectedPoints) {
                    await logValidationFailure(
                        pool, id, executor_id, executor_name,
                        `POINT_ADJUSTMENT validation rejected. Member=${memberIdentifier}, initial=${initialPoints}, adjustment=${pts}, expected=${expectedPoints}, h2h_points=${h2hPoints}`
                    );
                    return res.status(409).json({
                        error: 'Validasi point gagal. Point H2H belum mencapai target adjustment.',
                        validation: {
                            member: memberIdentifier,
                            initial_points: initialPoints,
                            adjustment: pts,
                            expected_points: expectedPoints,
                            h2h_points: h2hPoints
                        }
                    });
                }

                try {
                    const p55 = await getCustomerLookupPool();
                    await p55.request()
                        .input('card', sql.VarChar, ticket.customer_id)
                        .input('pts', sql.Int, pts)
                        .query(`
                            UPDATE RXL_LOYALID_CUSTOMER_MST
                            SET LATEST_POINT = LATEST_POINT + @pts,
                                UPDATED_AT = GETDATE()
                            WHERE RLICM_CARD_NO = @card OR RLICM_MOBILE_NO = @card
                        `);
                    executionNotes = `Point Adjustment Berhasil: ${pts > 0 ? '+' : ''}${pts} poin pada ${ticket.customer_id}. Validasi H2H: ${h2hPoints} poin (minimum ${expectedPoints}; valid jika >= minimum). Notes: ${result_notes || '-'}`;
                } catch (e55) {
                    console.error("Failed to execute Point Adjustment in DBWH_8555:", e55);
                    throw e55;
                }
            }
        } else if (ticket.request_type === 'DATA_UPDATE' && details.length > 0) {
            const detail = details[0];
            if (detail.field_name && detail.new_value) {
                const memberIdentifier = ticket.mobile_no || ticket.customer_id;
                let h2hData;
                let h2hValue;

                try {
                    h2hData = await getH2hMemberData(memberIdentifier);
                    h2hValue = getH2hFieldValue(h2hData, detail.field_name);
                } catch (h2hError) {
                    console.error("H2H data validation failed:", h2hError);
                    await logValidationFailure(
                        pool, id, executor_id, executor_name,
                        `DATA_UPDATE H2H validation error. Member=${memberIdentifier}, field=${detail.field_name}, requested=${detail.new_value}, error=${h2hError.message}`
                    );
                    return res.status(502).json({
                        error: 'Validasi perubahan data ke H2H gagal. Update tidak dilakukan.',
                        details: h2hError.message
                    });
                }

                if (normalizeValue(h2hValue) !== normalizeValue(detail.new_value)) {
                    await logValidationFailure(
                        pool, id, executor_id, executor_name,
                        `DATA_UPDATE validation rejected. Member=${memberIdentifier}, field=${detail.field_name}, requested=${detail.new_value}, h2h_value=${h2hValue ?? '(kosong)'}`
                    );
                    return res.status(409).json({
                        error: 'Validasi perubahan data gagal. Nilai H2H belum sama dengan nilai yang diajukan.',
                        validation: {
                            type: 'DATA_UPDATE',
                            member: memberIdentifier,
                            field: detail.field_name,
                            requested_value: detail.new_value,
                            h2h_value: h2hValue ?? null
                        }
                    });
                }

                try {
                    const colMap = {
                        customer_name: 'RLICM_NAME',
                        mobile_no: 'RLICM_MOBILE_NO',
                        email: 'RLICM_EMAIL_ID',
                        address: 'ADDRESS',
                        city: 'CITY',
                        district: 'DISTRICT',
                        dob: 'RLICM_DOB',
                        gender: 'GENDER'
                    };
                    const col = colMap[detail.field_name];
                    if (col) {
                        const p55 = await getCustomerLookupPool();
                        await p55.request()
                            .input('card', sql.VarChar, ticket.customer_id)
                            .input('val', sql.VarChar, detail.new_value)
                            .query(`
                                UPDATE RXL_LOYALID_CUSTOMER_MST
                                SET ${col} = @val,
                                    UPDATED_AT = GETDATE()
                                WHERE RLICM_CARD_NO = @card OR RLICM_MOBILE_NO = @card
                            `);
                        executionNotes = `Data Update Berhasil: ${detail.field_name} diubah menjadi '${detail.new_value}'. Validasi H2H: '${h2hValue}' sama dengan nilai yang diajukan. Notes: ${result_notes || '-'}`;
                    }
                } catch (e55) {
                    console.error("Failed to execute Data Update in DBWH_8555:", e55);
                    executionNotes += ` [Warning DBWH_8555: ${e55.message}]`;
                }
            }
        }

        // 3. Update ticket status in DBWH_8529
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
            const reqUpdate = new sql.Request(transaction);
            await reqUpdate
                .input('ticket_id', sql.VarChar, id)
                .input('status', sql.VarChar, 'Completed / Closed')
                .query(`
                    UPDATE CRM_TICKETS 
                    SET status = @status, updated_at = GETDATE(), closed_at = GETDATE()
                    WHERE ticket_id = @ticket_id
                `);
                
            const reqLog = new sql.Request(transaction);
            await reqLog
                .input('ticket_id', sql.VarChar, id)
                .input('action', sql.VarChar, 'EXECUTED')
                .input('actor_id', sql.VarChar, executor_id)
                .input('actor_name', sql.VarChar, executor_name)
                .input('details', sql.NVarChar, executionNotes)
                .query(`
                    INSERT INTO CRM_TICKET_AUDIT_LOGS 
                    (ticket_id, action, actor_id, actor_name, details)
                    VALUES (@ticket_id, @action, @actor_id, @actor_name, @details)
                `);

            await transaction.commit();
            res.json({ success: true, status: 'Completed / Closed', message: executionNotes });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error("Execute ticket error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const getTicketDashboard = async (req, res) => {
    try {
        const pool = await getTicketPool();
        const request = pool.request();
        
        // Count by status
        const statusRes = await request.query(`
            SELECT status, COUNT(*) as count 
            FROM CRM_TICKETS 
            GROUP BY status
        `);

        // Count by type
        const typeRes = await request.query(`
            SELECT request_type, COUNT(*) as count 
            FROM CRM_TICKETS 
            GROUP BY request_type
        `);
        
        // Count total tickets
        const totalRes = await request.query(`
            SELECT COUNT(*) as count 
            FROM CRM_TICKETS
        `);

        // Get tickets requiring action (Pending Approvals & Need Information & Approved)
        const pendingActionRes = await request.query(`
            SELECT COUNT(*) as count 
            FROM CRM_TICKETS 
            WHERE status LIKE 'Pending Approval%' OR status = 'Need Information' OR status = 'Approved'
        `);
        
        res.json({
            total: totalRes.recordset[0]?.count || 0,
            pending_action: pendingActionRes.recordset[0]?.count || 0,
            by_status: statusRes.recordset,
            by_type: typeRes.recordset
        });
    } catch (err) {
        console.error("Dashboard error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const lookupCustomer = async (req, res) => {
    const { term } = req.query;
    if (!term) {
        return res.status(400).json({ error: 'Search term is required.' });
    }
    try {
        // CRM ticket lookup must use the same live H2H source as the CRM lookup page.
        const snapshot = await getH2hMemberSnapshot(term);
        return res.json(snapshot);
    } catch (err) {
        console.error("Lookup customer error:", err);
        res.status(502).json({ error: err.message || 'Gagal mengambil data customer dari H2H.' });
    }
};

export const lookupBilling = async (req, res) => {
    const billing = String(req.query.billing || '').trim();
    if (!billing) return res.status(400).json({ error: 'Nomor billing wajib diisi.' });

    let hoPool;
    try {
        hoPool = await getHoServerPool();
        const result = await hoPool.request()
            .input('billing', sql.VarChar, billing)
            .query(`
                SELECT TOP 1
                    BILL_NO AS billing,
                    CONVERT(decimal(18, 2), ISNULL(NET_VALUE, 0)) AS net_value,
                    h.ORG_CD AS org_cd,
                    o.ORG_NAME AS store_name
                FROM POS_SALES_HDR h WITH (NOLOCK)
                LEFT JOIN organization_mst o WITH (NOLOCK)
                    ON o.ORG_CD = h.ORG_CD
                WHERE h.BILL_NO = @billing
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: `Billing ${billing} tidak ditemukan di database pepito_ho.` });
        }

        const billingRow = result.recordset[0];
        const netValue = Number(billingRow.net_value) || 0;
        const orgCd = billingRow.org_cd || null;

        res.json({
            billing: billingRow.billing,
            net_value: netValue,
            points: Math.floor(netValue / 50000),
            org_cd: orgCd,
            store_name: billingRow.store_name || null
        });
    } catch (err) {
        console.error('Billing lookup error:', err.message);
        res.status(500).json({ error: 'Gagal membaca net value billing dari pepito_ho.', details: err.message });
    } finally {
        if (hoPool) await hoPool.close().catch(() => {});
    }
};
