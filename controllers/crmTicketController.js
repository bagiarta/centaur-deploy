import sql from 'mssql';
import { poolPromise, initDb } from '../config/db.js';
import { getH2hToken, h2hConfig, requestH2hJson } from '../config/h2h.js';
import { sendWebPush } from './pushController.js';

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

function normalizedUserRole(user) {
    return String(user?.role_name || '').trim().toLowerCase();
}

function normalizedUserDivision(user) {
    return String(user?.division || '').trim().toLowerCase();
}

function normalizedUserPosition(user) {
    return String(user?.position || '').trim().toLowerCase();
}

function isManagerUser(user) {
    const role = normalizedUserRole(user);
    const division = normalizedUserDivision(user);
    const position = normalizedUserPosition(user);
    return position.includes('manager') || position.includes('area manager') ||
        role.includes('manager') ||
        (role === 'operation' && division === 'area manager');
}

function isMarketingApprover(user) {
    return normalizedUserPosition(user).includes('marketing') ||
        normalizedUserRole(user).includes('marketing') ||
        normalizedUserDivision(user).includes('marketing');
}

function isHigherApprover(user) {
    const role = normalizedUserRole(user);
    const position = normalizedUserPosition(user);
    return position.includes('director') || position.includes('head') ||
        position.includes('vice president') || position === 'vp' ||
        role.includes('director') || Boolean(user?.is_admin);
}

function isSysadminOperational(user) {
    const position = normalizedUserPosition(user);
    const role = normalizedUserRole(user);
    return Boolean(user?.is_admin) ||
        position.includes('sysadmin') || position.includes('system administrator') ||
        position.includes('it operational') || role.includes('it operational');
}

async function getActorUser(pool, req) {
    const identity = String(req.authenticatedUserId || req.headers['x-user-id'] || '').trim();
    if (!identity) {
        const error = new Error('Session user wajib tersedia untuk proses workflow CRM.');
        error.statusCode = 401;
        throw error;
    }

    const result = await pool.request()
        .input('identity', sql.NVarChar, identity)
        .query(`
            SELECT TOP 1
                u.id, u.username, u.full_name, u.division, u.location, u.position,
                r.name AS role_name, r.is_admin
            FROM Users u
            LEFT JOIN Roles r ON r.id = u.role_id
            WHERE u.id = @identity OR u.username = @identity
        `);

    if (result.recordset.length === 0) {
        const error = new Error(`User workflow ${identity} tidak ditemukan.`);
        error.statusCode = 403;
        throw error;
    }

    return result.recordset[0];
}

async function getItDirectorRecipients(pool) {
    const recipients = new Map();

    const roleResult = await pool.request().query(`
        SELECT u.id, u.username, u.full_name
        FROM Users u
        LEFT JOIN Roles r ON r.id = u.role_id
        WHERE LOWER(ISNULL(u.division, '')) = 'it'
          AND (LOWER(ISNULL(u.position, '')) LIKE '%director%'
               OR LOWER(ISNULL(r.name, '')) LIKE '%director%')
    `);
    for (const user of roleResult.recordset) recipients.set(user.id, user);

    // Optional explicit mapping for installations where the directory role is not named "Director".
    try {
        const configResult = await pool.request()
            .input('key', sql.NVarChar, 'CRM_IT_DIRECTOR_USER_IDS')
            .query('SELECT [value] FROM SystemConfigs WHERE [key] = @key');
        const configuredIds = String(configResult.recordset[0]?.value || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);
        for (const identity of configuredIds) {
            const userResult = await pool.request()
                .input('identity', sql.NVarChar, identity)
                .query(`
                    SELECT TOP 1 id, username, full_name
                    FROM Users
                    WHERE id = @identity OR username = @identity
                `);
            for (const user of userResult.recordset) recipients.set(user.id, user);
        }
    } catch (error) {
        console.warn('[CRM WORKFLOW] IT Director config lookup skipped:', error.message);
    }

    return [...recipients.values()];
}

function initialTicketWorkflow(requester) {
    // L2 = Manager approval, L3 = Marketing Manager or higher approval.
    // A manager's own level is recorded as an automatic approval and the
    // ticket goes directly to Marketing Manager / higher.
    if (isManagerUser(requester)) {
        return {
            level: 3,
            status: 'Pending Approval L3',
            managerAutoApproved: true
        };
    }

    return {
        level: 2,
        status: 'Pending Approval L2',
        managerAutoApproved: false
    };
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

const BILL_NOT_SYNC_REMARK = 'Data not sync please check rxlOfflineService Version Server.';
const BILL_NOT_MEMBER_REMARK = 'Data bill belum tercatat sebagai transaksi member.';
const DATA_UPDATE_COLUMN_MAP = {
    card_no: 'RLICM_CARD_NO',
    mobile_no: 'RLICM_MOBILE_NO',
};

async function findExistingDataUpdateCustomers(detail, currentCustomerId) {
    const field = String(detail?.field_name || '').trim();
    const value = String(detail?.new_value || '').trim();
    const column = DATA_UPDATE_COLUMN_MAP[field];
    if (!column || !value) return [];

    const customerPool = await getCustomerLookupPool();
    const result = await customerPool.request()
        .input('value', sql.VarChar, value)
        .input('current_customer_id', sql.VarChar, String(currentCustomerId || ''))
        .query(`
            SELECT TOP 10
                RLICM_NAME AS customer_name,
                RLICM_CARD_NO AS card_no,
                RLICM_MOBILE_NO AS mobile_no
            FROM RXL_LOYALID_CUSTOMER_MST WITH (NOLOCK)
            WHERE LTRIM(RTRIM(ISNULL(${column}, ''))) = LTRIM(RTRIM(@value))
              AND ISNULL(RLICM_CARD_NO, '') <> @current_customer_id
              AND ISNULL(RLICM_MOBILE_NO, '') <> @current_customer_id
            ORDER BY RLICM_NAME, RLICM_CARD_NO
        `);
    return result.recordset;
}

async function getMemberBillTransmissionStatus(billing) {
    const pool = await getCustomerLookupPool();
    const result = await pool.request()
        .input('billing', sql.VarChar, billing)
        .query(`
            SELECT TOP 1
                RLITQ_BILL_NO AS billing,
                TRANSMITION_TYPE AS transmition_type
            FROM RXL_LOYALTY_INTEG_TRANS_QUEUE WITH (NOLOCK)
            WHERE RLITQ_BILL_NO = @billing
              AND RLITQ_INTEG_CODE = '110'
            ORDER BY CASE WHEN TRANSMITION_TYPE = '1' THEN 0 ELSE 1 END
        `);

    if (result.recordset.length === 0) {
        return { found: false, transmition_type: null, automatic_remark: BILL_NOT_MEMBER_REMARK };
    }

    const row = result.recordset[0];
    const transmitionType = String(row.transmition_type ?? '').trim();
    if (transmitionType === '1') {
        return {
            found: true,
            transmition_type: transmitionType,
            automatic_remark: null,
            can_submit: false
        };
    }

    return {
        found: true,
        transmition_type: transmitionType,
        automatic_remark: BILL_NOT_SYNC_REMARK,
        can_submit: true
    };
}

function appendAutomaticRemark(reason, automaticRemark) {
    if (!automaticRemark) return reason || '';
    const currentReason = String(reason || '').trim();
    if (!currentReason) return automaticRemark;
    if (currentReason.includes(automaticRemark)) return currentReason;
    return `${currentReason} | ${automaticRemark}`;
}

async function preparePointAdjustmentDetails(details) {
    if (!Array.isArray(details)) return details;

    return Promise.all(details.map(async (detail) => {
        const billing = String(detail?.transaction_ref || '').trim();
        if (!billing) return detail;

        const transmission = await getMemberBillTransmissionStatus(billing);
        if (transmission.transmition_type === '1') {
            const error = new Error(`Bill ${billing} sudah sync dan tidak bisa diajukan kembali sebagai ticket.`);
            error.statusCode = 409;
            error.code = 'BILL_ALREADY_SYNC';
            throw error;
        }

        return {
            ...detail,
            reason: appendAutomaticRemark(detail.reason, transmission.automatic_remark)
        };
    }));
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
        const requester = await getActorUser(pool, req);
        const workflow = initialTicketWorkflow(requester);
        const effectiveRequesterId = requester.username;
        const effectiveRequesterName = requester.full_name || requester.username;
        let normalizedDetails = details;

        if (request_type === 'POINT_ADJUSTMENT') {
            normalizedDetails = await preparePointAdjustmentDetails(details);
        }
        
        // Validate Billing Number (transaction_ref) uniqueness
        if (request_type === 'POINT_ADJUSTMENT' && normalizedDetails && normalizedDetails.length > 0) {
            for (let detail of normalizedDetails) {
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

        // Prevent duplicate customer identity data before creating a DATA_UPDATE ticket.
        if (request_type === 'DATA_UPDATE' && normalizedDetails && normalizedDetails.length > 0) {
            const detail = normalizedDetails[0];
            const conflicts = await findExistingDataUpdateCustomers(detail, customer_id);
            if (conflicts.length > 0) {
                return res.status(409).json({
                    code: 'DATA_VALUE_ALREADY_USED',
                    error: `Nilai ${detail.field_name} sudah digunakan oleh customer lain.`,
                    field: detail.field_name,
                    requested_value: detail.new_value,
                    conflicts: conflicts.map(customer => ({
                        customer_name: customer.customer_name || '-',
                        card_no: customer.card_no || '-',
                        mobile_no: customer.mobile_no || '-'
                    }))
                });
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
                .input('requester_id', sql.VarChar, effectiveRequesterId)
                .input('requester_name', sql.VarChar, effectiveRequesterName)
                .input('unit_branch', sql.VarChar, unit_branch)
                .input('request_type', sql.VarChar, request_type)
                .input('priority', sql.VarChar, priority || 'NORMAL')
                .input('customer_id', sql.VarChar, customer_id)
                .input('customer_name', sql.VarChar, customer_name || null)
                .input('mobile_no', sql.VarChar, mobile_no || null)
                .input('status', sql.VarChar, workflow.status)
                .input('approval_level', sql.Int, workflow.level)
                .query(`
                    INSERT INTO CRM_TICKETS 
                    (ticket_id, requester_id, requester_name, unit_branch, request_type, priority, customer_id, customer_name, mobile_no, status, current_approval_level)
                    VALUES (@ticket_id, @requester_id, @requester_name, @unit_branch, @request_type, @priority, @customer_id, @customer_name, @mobile_no, @status, @approval_level)
                `);

            if (workflow.managerAutoApproved) {
                const reqAutoApproval = new sql.Request(transaction);
                await reqAutoApproval
                    .input('ticket_id', sql.VarChar, ticket_id)
                    .input('approver_id', sql.VarChar, effectiveRequesterId)
                    .input('approver_name', sql.VarChar, effectiveRequesterName)
                    .input('approver_role', sql.VarChar, requester.role_name || 'Manager')
                    .input('status', sql.VarChar, 'AUTO_APPROVED')
                    .input('comments', sql.NVarChar, 'Manager level requester: manager approval dianggap sudah terpenuhi.')
                    .query(`
                        INSERT INTO CRM_TICKET_APPROVALS
                        (ticket_id, approver_id, approver_name, approver_role, status, comments)
                        VALUES (@ticket_id, @approver_id, @approver_name, @approver_role, @status, @comments)
                    `);
            }

            // 2. Insert Details
            for (let detail of normalizedDetails) {
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
                .input('actor_id', sql.VarChar, effectiveRequesterId)
                .input('actor_name', sql.VarChar, effectiveRequesterName)
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
        res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
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
    const { approver_id, action, comments } = req.body;
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
        const actor = await getActorUser(pool, req);
        const actorIsRequester = String(actor.username).toLowerCase() === String(ticket.requester_id || '').toLowerCase();
        if (actorIsRequester && !actor.is_admin) {
            return res.status(403).json({ error: 'Requester tidak dapat melakukan approval atas ticket sendiri.' });
        }

        const canApproveCurrentLevel = Boolean(actor.is_admin) || (ticket.current_approval_level === 2
            ? isManagerUser(actor)
            : ticket.current_approval_level === 3
                ? (isMarketingApprover(actor) || isHigherApprover(actor))
                : ticket.current_approval_level === 1
                    ? isManagerUser(actor)
                    : false);
        if (!canApproveCurrentLevel) {
            return res.status(403).json({
                error: `User ${actor.username} (${actor.role_name || 'Unknown Role'}) tidak berwenang untuk approval level ${ticket.current_approval_level}.`
            });
        }

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
                newLevel = 3;
                newStatus = 'Approved';
            }
        } else {
            return res.status(400).json({ error: 'Approval action tidak valid.' });
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
                .input('approver_id', sql.VarChar, actor.username)
                .input('approver_name', sql.VarChar, actor.full_name || actor.username)
                .input('approver_role', sql.VarChar, actor.role_name || actor.division || 'Unknown')
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
                .input('actor_id', sql.VarChar, actor.username)
                .input('actor_name', sql.VarChar, actor.full_name || actor.username)
                .input('details', sql.NVarChar, `Action ${action}. Comments: ${comments}. New Status: ${newStatus}`)
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
        let normalizedDetails = details;

        if (request_type === 'POINT_ADJUSTMENT') {
            normalizedDetails = await preparePointAdjustmentDetails(details);
        }

        const currentTicket = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query('SELECT customer_id, requester_id FROM CRM_TICKETS WHERE ticket_id = @ticket_id');
        if (currentTicket.recordset.length === 0) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const actor = await getActorUser(pool, req);
        const isTicketRequester = String(actor.username).toLowerCase() === String(currentTicket.recordset[0].requester_id || '').toLowerCase();
        if (!isTicketRequester && !isHigherApprover(actor)) {
            return res.status(403).json({ error: 'Hanya requester atau administrator yang dapat melakukan resubmit ticket.' });
        }
        const workflow = initialTicketWorkflow(actor);
        
        // Validate Billing Number (transaction_ref) uniqueness, excluding current ticket
        if (request_type === 'POINT_ADJUSTMENT' && normalizedDetails && normalizedDetails.length > 0) {
            for (let detail of normalizedDetails) {
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
                .input('status', sql.VarChar, workflow.status)
                .input('approval_level', sql.Int, workflow.level)
                .query(`
                    UPDATE CRM_TICKETS 
                    SET status = @status, current_approval_level = @approval_level, updated_at = GETDATE(), request_type = @request_type
                    WHERE ticket_id = @ticket_id
                `);

            if (workflow.managerAutoApproved) {
                await new sql.Request(transaction)
                    .input('ticket_id', sql.VarChar, id)
                    .input('approver_id', sql.VarChar, actor.username)
                    .input('approver_name', sql.VarChar, actor.full_name || actor.username)
                    .input('approver_role', sql.VarChar, actor.role_name || 'Manager')
                    .input('status', sql.VarChar, 'AUTO_APPROVED')
                    .input('comments', sql.NVarChar, 'Manager level requester: manager approval dianggap sudah terpenuhi saat resubmit.')
                    .query(`
                        INSERT INTO CRM_TICKET_APPROVALS
                        (ticket_id, approver_id, approver_name, approver_role, status, comments)
                        VALUES (@ticket_id, @approver_id, @approver_name, @approver_role, @status, @comments)
                    `);
            }

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
            
            if (normalizedDetails && normalizedDetails.length > 0) {
                // Delete old details
                const reqDelDetails = new sql.Request(transaction);
                await reqDelDetails.input('ticket_id', sql.VarChar, id).query("DELETE FROM CRM_TICKET_DETAILS WHERE ticket_id = @ticket_id");

                // Insert new details
                for (let detail of normalizedDetails) {
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
                .input('actor_id', sql.VarChar, actor.username)
                .input('actor_name', sql.VarChar, actor.full_name || actor.username)
                .input('details', sql.NVarChar, `Resubmitted. Notes: ${notes}`)
                .query(`
                    INSERT INTO CRM_TICKET_AUDIT_LOGS 
                    (ticket_id, action, actor_id, actor_name, details)
                    VALUES (@ticket_id, @action, @actor_id, @actor_name, @details)
                `);

            await transaction.commit();
            res.json({ success: true, status: workflow.status });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error("Resubmit ticket error:", err);
        res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
    }
};

export const deleteTicket = async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await getTicketPool();
        const actor = await getActorUser(pool, req);
        if (!actor.is_admin) {
            return res.status(403).json({ error: 'Hanya Administrator yang dapat menghapus ticket.' });
        }

        const ticketResult = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query('SELECT ticket_id, status FROM CRM_TICKETS WHERE ticket_id = @ticket_id');
        const ticket = ticketResult.recordset[0];
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        if (String(ticket.status || '').toLowerCase() === 'completed / closed') {
            return res.status(409).json({ error: 'Ticket Completed / Closed tidak dapat dihapus.' });
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            for (const table of ['CRM_TICKET_APPROVALS', 'CRM_TICKET_DETAILS', 'CRM_TICKET_AUDIT_LOGS']) {
                await new sql.Request(transaction)
                    .input('ticket_id', sql.VarChar, id)
                    .query(`DELETE FROM ${table} WHERE ticket_id = @ticket_id`);
            }
            await new sql.Request(transaction)
                .input('ticket_id', sql.VarChar, id)
                .query('DELETE FROM CRM_TICKETS WHERE ticket_id = @ticket_id');
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        res.json({ success: true, message: `Ticket ${id} berhasil dihapus.` });
    } catch (err) {
        console.error('Delete CRM ticket error:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

export const executeTicket = async (req, res) => {
    const { id } = req.params;
    const { executor_id, executor_name, result_notes } = req.body;
    
    try {
        const pool = await getTicketPool();
        const executor = await getActorUser(pool, req);
        if (!isSysadminOperational(executor)) {
            return res.status(403).json({ error: 'Execute ticket hanya dapat dilakukan oleh user IT OPERATIONAL (Sysadmin Operational).' });
        }

        // 1. Fetch ticket and details
        const ticketRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKETS WHERE ticket_id = @ticket_id");
        
        if (ticketRes.recordset.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        const ticket = ticketRes.recordset[0];

        if (ticket.status !== 'Approved') {
            return res.status(409).json({ error: `Ticket belum siap dieksekusi. Status saat ini: ${ticket.status}.` });
        }

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
            const adjustmentBillNo = String(detail.transaction_ref || '').trim();
            if (!adjustmentBillNo) {
                const message = 'Execute adjustment ditolak: bill_no belum tersedia pada ticket.';
                await logValidationFailure(pool, id, executor_id, executor_name, message);
                return res.status(409).json({
                    error: message,
                    code: 'BILL_NOT_PROCESSED',
                    validation: { type: 'BILL_NOT_PROCESSED', bill_no: null }
                });
            }

            try {
                const billPool = await getCustomerLookupPool();
                const billResult = await billPool.request()
                    .input('billing', sql.VarChar, adjustmentBillNo)
                    .query(`
                        SELECT TOP 1 RLITQ_BILL_NO AS bill_no, PROCESSED_FLAG AS processed_flag
                        FROM RXL_LOYALTY_INTEG_TRANS_QUEUE WITH (NOLOCK)
                        WHERE RLITQ_BILL_NO = @billing
                          AND RLITQ_INTEG_CODE = '110'
                        ORDER BY CASE WHEN ISNULL(PROCESSED_FLAG, 0) IN (1, -1) THEN 0 ELSE 1 END,
                                 RLITQ_BILL_NO
                    `);
                const billRow = billResult.recordset[0];
                const processedFlag = Number(billRow?.processed_flag);
                if (!billRow || ![1, -1].includes(processedFlag)) {
                    const message = billRow
                        ? `Execute adjustment ditolak: bill_no ${adjustmentBillNo} memiliki processed_flag ${billRow.processed_flag}; nilai yang diizinkan hanya 1 atau -1.`
                        : `Execute adjustment ditolak: bill_no ${adjustmentBillNo} tidak ditemukan pada transaksi member.`;
                    await logValidationFailure(pool, id, executor_id, executor_name, message);
                    return res.status(409).json({
                        error: message,
                        code: 'BILL_NOT_PROCESSED',
                        validation: {
                            type: 'BILL_NOT_PROCESSED',
                            bill_no: adjustmentBillNo,
                            found: Boolean(billRow),
                            processed_flag: billRow?.processed_flag ?? null
                        }
                    });
                }
            } catch (billError) {
                console.error('Adjustment bill validation failed:', billError);
                await logValidationFailure(
                    pool, id, executor_id, executor_name,
                    `POINT_ADJUSTMENT bill validation error. bill_no=${adjustmentBillNo}, error=${billError.message}`
                );
                return res.status(502).json({
                    error: 'Validasi bill_no ke DBWH_8555 gagal. Execute tidak dilakukan.',
                    code: 'BILL_VALIDATION_ERROR'
                });
            }

            const memberIdentifier = ticket.mobile_no || ticket.customer_id;
            let h2hPoints;
            try {
                // H2H is the source of truth for the resulting point balance.
                h2hPoints = await getH2hMemberPoints(memberIdentifier);
            } catch (h2hError) {
                console.error("H2H point lookup failed:", h2hError);
                await logValidationFailure(
                    pool, id, executor_id, executor_name,
                    `POINT_ADJUSTMENT H2H point lookup error. Member=${memberIdentifier}, error=${h2hError.message}`
                );
                return res.status(502).json({
                    error: 'Pengambilan jumlah point dari H2H gagal. Update tidak dilakukan.',
                    details: h2hError.message
                });
            }

            try {
                const p55 = await getCustomerLookupPool();
                await p55.request()
                    .input('card', sql.VarChar, ticket.customer_id)
                    .input('h2hPoints', sql.Int, h2hPoints)
                    .query(`
                        UPDATE RXL_LOYALID_CUSTOMER_MST
                        SET LATEST_POINT = @h2hPoints,
                            UPDATED_AT = GETDATE()
                        WHERE RLICM_CARD_NO = @card OR RLICM_MOBILE_NO = @card
                    `);
                executionNotes = `Point Adjustment Berhasil: LATEST_POINT pada ${ticket.customer_id} disesuaikan ke point H2H (${h2hPoints}). Notes: ${result_notes || '-'}`;
            } catch (e55) {
                console.error("Failed to execute Point Adjustment in DBWH_8555:", e55);
                throw e55;
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
                .input('actor_id', sql.VarChar, executor.username)
                .input('actor_name', sql.VarChar, executor.full_name || executor.username)
                .input('details', sql.NVarChar, executionNotes)
                .query(`
                    INSERT INTO CRM_TICKET_AUDIT_LOGS 
                    (ticket_id, action, actor_id, actor_name, details)
                    VALUES (@ticket_id, @action, @actor_id, @actor_name, @details)
                `);

            await transaction.commit();

            const itDirectors = await getItDirectorRecipients(pool);
            const recipientLabels = itDirectors.map(user => user.username || user.full_name || user.id);
            const reportDetails = `Execution report: ${executionNotes}. CC IT Director: ${recipientLabels.join(', ') || '(belum dikonfigurasi)'}`;

            await pool.request()
                .input('ticket_id', sql.VarChar, id)
                .input('action', sql.VarChar, 'EXECUTION_REPORT_CC')
                .input('actor_id', sql.VarChar, executor.username)
                .input('actor_name', sql.VarChar, executor.full_name || executor.username)
                .input('details', sql.NVarChar, reportDetails)
                .query(`
                    INSERT INTO CRM_TICKET_AUDIT_LOGS
                    (ticket_id, action, actor_id, actor_name, details)
                    VALUES (@ticket_id, @action, @actor_id, @actor_name, @details)
                `);

            await Promise.all(itDirectors.map(user => sendWebPush(user.id, {
                title: `CRM Ticket Executed: ${id}`,
                body: reportDetails,
                url: `/crm/tickets?ticket=${encodeURIComponent(id)}`,
                type: 'crm_ticket_execution_report',
                ticket_id: id
            })));

            res.json({
                success: true,
                status: 'Completed / Closed',
                message: executionNotes,
                cc_recipients: recipientLabels
            });
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

        const memberTransaction = await getMemberBillTransmissionStatus(billing);

        if (memberTransaction.transmition_type === '1') {
            return res.status(409).json({
                code: 'BILL_ALREADY_SYNC',
                error: `Bill ${billing} sudah sync dan tidak bisa diajukan kembali sebagai ticket.`,
                billing,
                member_transaction_found: true,
                transmition_type: memberTransaction.transmition_type,
                can_submit: false
            });
        }

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
            store_name: billingRow.store_name || null,
            member_transaction_found: memberTransaction.found,
            transmition_type: memberTransaction.transmition_type,
            automatic_remark: memberTransaction.automatic_remark,
            can_submit: true
        });
    } catch (err) {
        console.error('Billing lookup error:', err.message);
        res.status(500).json({ error: 'Gagal membaca net value billing dari pepito_ho.', details: err.message });
    } finally {
        if (hoPool) await hoPool.close().catch(() => {});
    }
};
