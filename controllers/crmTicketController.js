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

function safeParsePoints(val) {
    if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
    if (!val) return 0;
    const cleaned = String(val).replace(/pts/gi, '').replace(/[+,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num);
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

function safeParseJson(value, fallback = []) {
    if (!value) return fallback;
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

export async function getEffectiveWorkflowConfig(pool, requestType = 'DEFAULT') {
    let result = null;
    try {
        result = await pool.request()
            .input('key', sql.VarChar, requestType)
            .query("SELECT TOP 1 * FROM CRM_TICKET_WORKFLOW_CONFIG WHERE config_key = @key");
    } catch (e) {
        console.warn('[CRM WORKFLOW] Failed reading specific config:', e.message);
    }

    if (!result || result.recordset.length === 0) {
        try {
            result = await pool.request()
                .input('key', sql.VarChar, 'DEFAULT')
                .query("SELECT TOP 1 * FROM CRM_TICKET_WORKFLOW_CONFIG WHERE config_key = @key");
        } catch (e) {
            console.warn('[CRM WORKFLOW] Failed reading default config:', e.message);
        }
    }

    const row = result?.recordset?.[0] || {};
    return {
        config_key: row.config_key || 'DEFAULT',
        total_levels: Math.min(Math.max(Number(row.total_levels) || 2, 1), 3),
        level_1_name: row.level_1_name || 'Level 1 - Supervisor / Team Leader',
        level_1_users: safeParseJson(row.level_1_users, []),
        level_2_name: row.level_2_name || 'Level 2 - Department Head / Marketing',
        level_2_users: safeParseJson(row.level_2_users, []),
        level_3_name: row.level_3_name || 'Level 3 - Director / Management',
        level_3_users: safeParseJson(row.level_3_users, []),
        executor_users: safeParseJson(row.executor_users, []),
        auto_skip_requester_level: row.auto_skip_requester_level !== undefined ? Boolean(row.auto_skip_requester_level) : true,
        allow_admin_override: row.allow_admin_override !== undefined ? Boolean(row.allow_admin_override) : true,
    };
}

function isUserInList(user, list) {
    if (!user || !Array.isArray(list) || list.length === 0) return false;
    const targetUsername = String(user.username || '').trim().toLowerCase();
    const targetId = String(user.id || '').trim().toLowerCase();
    return list.some(item => {
        const s = String(item || '').trim().toLowerCase();
        return s === targetUsername || s === targetId;
    });
}

async function getUserFullNameMap(pool) {
    const res = await pool.request().query(`
        SELECT u.id, u.username, u.full_name, r.name as role_name, u.division, u.position
        FROM USERS u
        LEFT JOIN ROLES r ON u.role_id = r.id
    `);
    const map = new Map();
    const allUsers = res.recordset;
    for (const u of allUsers) {
        const name = u.full_name || u.username;
        if (u.username) map.set(u.username.toLowerCase(), name);
        if (u.id) map.set(u.id.toLowerCase(), name);
        if (u.full_name) map.set(u.full_name.toLowerCase(), name);
    }
    return { map, allUsers };
}

function getPendingApproverNames(ticket, config, userMapData) {
    if (!ticket.status || !ticket.status.includes('Pending Approval')) {
        return null;
    }
    const { map, allUsers } = userMapData || { map: new Map(), allUsers: [] };
    const level = Number(ticket.current_approval_level || 1);
    const configuredUsers = config?.[`level_${level}_users`];
    
    if (Array.isArray(configuredUsers) && configuredUsers.length > 0) {
        const names = configuredUsers
            .map(u => map.get(String(u).trim().toLowerCase()) || u)
            .filter(Boolean);
        if (names.length > 0) {
            return names.join(', ');
        }
    }

    // Fallback if no specific users configured: find users by role/position for this level
    if (level === 1 || level === 2) {
        const managers = allUsers
            .filter(u => {
                const pos = String(u.position || '').toLowerCase();
                const role = String(u.role_name || '').toLowerCase();
                const div = String(u.division || '').toLowerCase();
                return pos.includes('manager') || role.includes('manager') || (role === 'operation' && div.includes('manager'));
            })
            .map(u => u.full_name || u.username);
        if (managers.length > 0) {
            return managers.slice(0, 3).join(', ');
        }
    } else if (level === 3) {
        const marketing = allUsers
            .filter(u => {
                const pos = String(u.position || '').toLowerCase();
                const role = String(u.role_name || '').toLowerCase();
                const div = String(u.division || '').toLowerCase();
                return pos.includes('marketing') || pos.includes('director') || role.includes('marketing') || div.includes('marketing');
            })
            .map(u => u.full_name || u.username);
        if (marketing.length > 0) {
            return marketing.slice(0, 3).join(', ');
        }
    }

    return null;
}

function canUserApproveTicket(actor, ticket, config, pendingApproverName) {
    if (!actor || !ticket) {
        return { allowed: false, reason: 'Informasi user atau ticket tidak valid.' };
    }

    // 1. Segregation of duties: requester cannot approve own ticket unless super admin override
    const actorUsername = String(actor.username || '').trim().toLowerCase();
    const actorId = String(actor.id || '').trim().toLowerCase();
    const requesterId = String(ticket.requester_id || '').trim().toLowerCase();
    if ((actorUsername === requesterId || actorId === requesterId) && !actor.is_admin) {
        return { allowed: false, reason: 'Requester tidak dapat melakukan approval atas ticket sendiri.' };
    }

    // 2. Admin override if enabled
    if (Boolean(actor.is_admin) && (config?.allow_admin_override ?? true)) {
        return { allowed: true };
    }

    const level = Number(ticket.current_approval_level);
    const waitingReason = pendingApproverName 
        ? `Menunggu approval dari: ${pendingApproverName}.`
        : 'Menunggu approval dari approver terkait.';

    if (level === 1) {
        if (config?.level_1_users && config.level_1_users.length > 0) {
            const match = isUserInList(actor, config.level_1_users);
            return {
                allowed: match,
                reason: match ? '' : waitingReason
            };
        }
        return {
            allowed: isManagerUser(actor),
            reason: isManagerUser(actor) ? '' : waitingReason
        };
    }

    if (level === 2) {
        if (config?.level_2_users && config.level_2_users.length > 0) {
            const match = isUserInList(actor, config.level_2_users);
            return {
                allowed: match,
                reason: match ? '' : waitingReason
            };
        }
        return {
            allowed: isManagerUser(actor),
            reason: isManagerUser(actor) ? '' : waitingReason
        };
    }

    if (level === 3) {
        if (config?.level_3_users && config.level_3_users.length > 0) {
            const match = isUserInList(actor, config.level_3_users);
            return {
                allowed: match,
                reason: match ? '' : waitingReason
            };
        }
        const legacyMatch = isMarketingApprover(actor) || isHigherApprover(actor);
        return {
            allowed: legacyMatch,
            reason: legacyMatch ? '' : waitingReason
        };
    }

    return { allowed: false, reason: 'Ticket berada pada status yang tidak memerlukan approval.' };
}

function canUserExecuteTicket(actor, config) {
    if (!actor) return false;
    if (Boolean(actor.is_admin) && (config?.allow_admin_override ?? true)) return true;

    if (config?.executor_users && config.executor_users.length > 0) {
        return isUserInList(actor, config.executor_users);
    }
    // Fallback to legacy check
    return isSysadminOperational(actor);
}

function initialTicketWorkflow(requester, config) {
    const totalLevels = config ? Math.min(Math.max(Number(config.total_levels) || 2, 1), 3) : 2;
    const autoSkip = config ? (config.auto_skip_requester_level ?? true) : true;

    let isRequesterL1 = false;
    if (config?.level_1_users && config.level_1_users.length > 0) {
        isRequesterL1 = isUserInList(requester, config.level_1_users);
    } else {
        isRequesterL1 = isManagerUser(requester);
    }

    if (isRequesterL1 && autoSkip) {
        if (totalLevels === 1) {
            return {
                level: 1,
                status: 'Approved',
                managerAutoApproved: true
            };
        }
        return {
            level: 2,
            status: 'Pending Approval L2',
            managerAutoApproved: true
        };
    }

    return {
        level: 1,
        status: 'Pending Approval L1',
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
    mobile_no: 'RLICM_MOBILE_NO',
};

const IMMUTABLE_DATA_UPDATE_FIELDS = new Set(['card_no']);

function isImmutableDataUpdateField(fieldName) {
    return IMMUTABLE_DATA_UPDATE_FIELDS.has(String(fieldName || '').trim().toLowerCase());
}

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
                TRANSMITION_TYPE AS transmition_type,
                PROCESSED_FLAG AS processed_flag,
                EXTRA_INFO_1 AS extra_info_1
            FROM RXL_LOYALTY_INTEG_TRANS_QUEUE WITH (NOLOCK)
            WHERE RLITQ_BILL_NO = @billing
              AND RLITQ_INTEG_CODE = '110'
            ORDER BY CASE
                WHEN ISNULL(PROCESSED_FLAG, 0) = 1 AND UPPER(LTRIM(RTRIM(ISNULL(EXTRA_INFO_1, '')))) = 'OK' THEN 0
                WHEN ISNULL(PROCESSED_FLAG, 0) = -1 AND UPPER(LTRIM(RTRIM(ISNULL(EXTRA_INFO_1, '')))) LIKE '%DUPLICATE%' THEN 0
                WHEN ISNULL(PROCESSED_FLAG, 0) = 0 AND LTRIM(RTRIM(ISNULL(EXTRA_INFO_1, ''))) = '' THEN 1
                ELSE 2
            END
        `);

    if (result.recordset.length === 0) {
        return {
            found: false,
            transmition_type: null,
            processed_flag: null,
            extra_info_1: null,
            automatic_remark: BILL_NOT_MEMBER_REMARK,
            can_submit: true,
            is_already_synced: false
        };
    }

    const row = result.recordset[0];
    const transmitionType = String(row.transmition_type ?? '').trim();
    const processedFlag = Number(row.processed_flag);
    const extraInfo = String(row.extra_info_1 ?? '').trim();
    const isNotSync = processedFlag === 0 && extraInfo === '';
    const isAlreadySynced =
        (processedFlag === 1 && extraInfo.toUpperCase() === 'OK') ||
        (processedFlag === -1 && extraInfo.toUpperCase().includes('DUPLICATE'));

    if (isAlreadySynced) {
        return {
            found: true,
            transmition_type: transmitionType,
            processed_flag: processedFlag,
            extra_info_1: extraInfo,
            automatic_remark: null,
            can_submit: false,
            is_already_synced: true
        };
    }

    return {
        found: true,
        transmition_type: transmitionType,
        processed_flag: processedFlag,
        extra_info_1: extraInfo,
        automatic_remark: isNotSync ? BILL_NOT_SYNC_REMARK : null,
        can_submit: true,
        is_already_synced: false
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
        if (transmission.is_already_synced) {
            const error = new Error(`Bill ${billing} sudah terproses sebagai transaksi member, data sudah tersyncrone dan tidak bisa diajukan kembali sebagai ticket.`);
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

async function getBillingQueueSeed(billing, fallbackCard, openingPoints) {
    const hoPool = await getHoServerPool();
    try {
        const result = await hoPool.request()
            .input('billing', sql.VarChar, billing)
            .query(`
                SELECT TOP 1 BILL_NO AS bill_no, ORG_CD AS org_cd
                FROM POS_SALES_HDR WITH (NOLOCK)
                WHERE BILL_NO = @billing
            `);
        const row = result.recordset[0];
        if (!row) return null;
        return {
            bill_no: row.bill_no,
            org_cd: String(row.org_cd || '').trim(),
            // The queue card must follow the card/member submitted in the ticket.
            // Do not replace it with POS_SALES_HDR's default customer/card value.
            card_no: String(fallbackCard || '').trim(),
            opening_points: Number.isFinite(Number(openingPoints)) ? Number(openingPoints) : 0
        };
    } finally {
        await hoPool.close().catch(() => {});
    }
}

async function stageMissingAdjustmentQueue(poolOrTransaction, ticketId, detail, fallbackCard) {
    const billing = String(detail?.transaction_ref || '').trim();
    if (!billing) return false;
    const transmission = await getMemberBillTransmissionStatus(billing);
    if (transmission.found) return false;

    const oldValuePoints = Number(detail?.old_value);
    const h2hPoints = Number.isFinite(oldValuePoints)
        ? oldValuePoints
        : await getH2hMemberPoints(fallbackCard);
    const seed = await getBillingQueueSeed(billing, fallbackCard, h2hPoints);
    if (!seed?.org_cd || !seed?.card_no) {
        const error = new Error(`Bill ${billing} belum memiliki org_cd atau card_no yang valid dari POS_SALES_HDR.`);
        error.statusCode = 409;
        error.code = 'BILL_QUEUE_SEED_NOT_FOUND';
        throw error;
    }

    await new sql.Request(poolOrTransaction)
        .input('ticket_id', sql.VarChar, ticketId)
        .input('org_cd', sql.VarChar, seed.org_cd)
        .input('bill_no', sql.VarChar, seed.bill_no)
        .input('card_no', sql.VarChar, seed.card_no)
        .input('opening_points', sql.Decimal(18, 2), seed.opening_points)
        .query(`
            MERGE CRM_TICKET_QUEUE_TEMP AS target
            USING (SELECT @ticket_id AS ticket_id) AS source
            ON target.ticket_id = source.ticket_id
            WHEN MATCHED THEN UPDATE SET
                rl_itq_org_cd = @org_cd, rl_itq_bill_no = @bill_no,
                rl_itq_card_no = @card_no, rl_itq_opening_points = @opening_points,
                processed_flag = 0, extra_info_1 = '', sync_status = 'PENDING',
                sync_error = NULL, synced_at = NULL, updated_at = GETDATE()
            WHEN NOT MATCHED THEN INSERT
                (ticket_id, rl_itq_org_cd, rl_itq_bill_no, rl_itq_card_no, rl_itq_opening_points)
            VALUES (@ticket_id, @org_cd, @bill_no, @card_no, @opening_points);
        `);
    return true;
}

async function resolveOrgTargetPool(orgCd) {
    const normalizedOrg = String(orgCd || '').trim().padStart(3, '0');
    if (!/^\d{3}$/.test(normalizedOrg)) {
        const error = new Error(`org_cd '${orgCd}' tidak valid untuk koneksi server tujuan.`);
        error.statusCode = 409;
        error.code = 'ORG_CONNECTION_NOT_CONFIGURED';
        throw error;
    }
    const pool = await getTicketPool();
    const result = await pool.request()
        .input('hostname', sql.NVarChar, `STORESRVR${normalizedOrg}`)
        .query(`
            SELECT TOP 1 d.ip, c.db_user, c.db_password, c.db_name
            FROM Devices d
            JOIN DeviceDbConnections c ON c.device_id = d.id
            WHERE UPPER(d.hostname) = @hostname
        `);
    const config = result.recordset[0];
    if (!config?.ip || !config?.db_user || !config?.db_name) {
        const error = new Error(`Koneksi database untuk org_cd ${normalizedOrg} belum dikonfigurasi. Isi DeviceDbConnections pada device STORESRVR${normalizedOrg}.`);
        error.statusCode = 409;
        error.code = 'ORG_CONNECTION_NOT_CONFIGURED';
        throw error;
    }
    const targetPool = new sql.ConnectionPool({
        user: config.db_user, password: config.db_password, server: config.ip,
        database: config.db_name,
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
        connectionTimeout: 10000, requestTimeout: 30000
    });
    await targetPool.connect();
    return targetPool;
}

async function pushStagedAdjustment(pool, ticketId) {
    const staged = await pool.request()
        .input('ticket_id', sql.VarChar, ticketId)
        .query(`SELECT TOP 1 * FROM CRM_TICKET_QUEUE_TEMP WHERE ticket_id = @ticket_id AND ISNULL(sync_status, 'PENDING') <> 'SYNCED'`);
    const row = staged.recordset[0];
    if (!row) return null;

    const targetPool = await resolveOrgTargetPool(row.rl_itq_org_cd);
    let alreadyExisted = false;
    let alreadySynced = false;
    let existingQueue = null;

    try {
        const billNoClean = String(row.rl_itq_bill_no || '').trim();
        // Validasi keberadaan bill_no pada antrean server target agar tidak terjadi duplikasi
        const existsResult = await targetPool.request()
            .input('bill_no', sql.VarChar, billNoClean)
            .query(`
                SELECT TOP 1 
                    RLITQ_BILL_NO AS bill_no,
                    RLITQ_ORG_CD AS org_cd,
                    RLITQ_INTEG_CODE AS integ_code,
                    PROCESSED_FLAG AS processed_flag,
                    EXTRA_INFO_1 AS extra_info_1,
                    TXN_TIMESTAMP AS txn_timestamp
                FROM RXL_LOYALTY_INTEG_TRANS_QUEUE WITH (NOLOCK)
                WHERE LTRIM(RTRIM(RLITQ_BILL_NO)) = @bill_no
                ORDER BY CASE
                    WHEN ISNULL(PROCESSED_FLAG, 0) = 1 AND UPPER(LTRIM(RTRIM(ISNULL(EXTRA_INFO_1, '')))) LIKE '%OK%' THEN 0
                    WHEN ISNULL(PROCESSED_FLAG, 0) = -1 AND UPPER(LTRIM(RTRIM(ISNULL(EXTRA_INFO_1, '')))) LIKE '%DUPLICATE%' THEN 0
                    ELSE 1
                END, TXN_TIMESTAMP DESC
            `);

        if (existsResult.recordset.length > 0) {
            alreadyExisted = true;
            existingQueue = existsResult.recordset[0];
            const flag = Number(existingQueue.processed_flag);
            const extra = String(existingQueue.extra_info_1 || '').trim().toUpperCase();
            alreadySynced = (flag === 1 && extra.includes('OK')) || (flag === -1 && extra.includes('DUPLICATE'));
            console.log(`[CRM QUEUE] Bill ${billNoClean} sudah ada di server target (org_cd: ${row.rl_itq_org_cd}, flag: ${flag}, extra: ${extra || '-'}). Insert queue dilewati.`);
        } else {
            // Jika belum ada, lakukan insert dengan pengaman atomik IF NOT EXISTS
            await targetPool.request()
                .input('integ_code', sql.VarChar, row.rl_itq_integ_code)
                .input('txn_type', sql.VarChar, row.rl_itq_txn_type)
                .input('org_cd', sql.VarChar, row.rl_itq_org_cd)
                .input('bill_no', sql.VarChar, billNoClean)
                .input('processed_flag', sql.Int, 0)
                .input('card_no', sql.VarChar, row.rl_itq_card_no)
                .input('opening_points', sql.Decimal(18, 2), row.rl_itq_opening_points || 0)
                .query(`
                    IF NOT EXISTS (
                        SELECT 1 FROM RXL_LOYALTY_INTEG_TRANS_QUEUE WITH (NOLOCK)
                        WHERE LTRIM(RTRIM(RLITQ_BILL_NO)) = @bill_no
                    )
                    BEGIN
                        INSERT INTO RXL_LOYALTY_INTEG_TRANS_QUEUE
                        (RLITQ_INTEG_CODE, RLITQ_TXN_TYPE, RLITQ_ORG_CD, RLITQ_BILL_NO,
                         PROCESSED_FLAG, TXN_TIMESTAMP, TRANSMITION_TYPE, RLITQ_CARD_NO,
                         RLITQ_OPENING_POINTS, EXTRA_INFO_1, EXCHANGE_RATE)
                        VALUES (@integ_code, @txn_type, @org_cd, @bill_no, @processed_flag,
                                GETDATE(), 'O', @card_no, @opening_points, '', 1);
                    END
                `);
            console.log(`[CRM QUEUE] Bill ${billNoClean} berhasil di-insert ke server target (org_cd: ${row.rl_itq_org_cd}).`);
        }
    } finally {
        await targetPool.close().catch(() => {});
    }

    if (alreadySynced && existingQueue) {
        await pool.request()
            .input('ticket_id', sql.VarChar, ticketId)
            .input('flag', sql.Int, Number(existingQueue.processed_flag))
            .input('extra', sql.VarChar, existingQueue.extra_info_1 || '')
            .query(`
                UPDATE CRM_TICKET_QUEUE_TEMP 
                SET sync_status = 'SYNCED', 
                    processed_flag = @flag, 
                    extra_info_1 = @extra, 
                    sync_error = NULL, 
                    synced_at = GETDATE(), 
                    updated_at = GETDATE() 
                WHERE ticket_id = @ticket_id
            `);
    } else {
        const flagVal = existingQueue ? Number(existingQueue.processed_flag) : 0;
        const extraVal = existingQueue ? (existingQueue.extra_info_1 || '') : '';
        await pool.request()
            .input('ticket_id', sql.VarChar, ticketId)
            .input('flag', sql.Int, isNaN(flagVal) ? 0 : flagVal)
            .input('extra', sql.VarChar, extraVal)
            .query(`
                UPDATE CRM_TICKET_QUEUE_TEMP 
                SET sync_status = 'PENDING', 
                    processed_flag = @flag, 
                    extra_info_1 = @extra,
                    sync_error = NULL, 
                    synced_at = NULL, 
                    updated_at = GETDATE() 
                WHERE ticket_id = @ticket_id
            `);
    }

    return {
        ...row,
        already_existed: alreadyExisted,
        already_synced: alreadySynced,
        existing_queue: existingQueue
    };
}

let crmPendingSyncJobStarted = false;
let crmPendingSyncJobRunning = false;

export function startCrmPendingSyncJob() {
    if (crmPendingSyncJobStarted) return;
    crmPendingSyncJobStarted = true;
    // Check existing Synchronization Pending tickets immediately after startup.
    syncPendingAdjustmentTickets().catch(error => {
        console.error('[CRM SYNC] Initial pending adjustment sync failed:', error.message);
    });
    setInterval(() => {
        syncPendingAdjustmentTickets().catch(error => {
            console.error('[CRM SYNC] Pending adjustment sync job failed:', error.message);
        });
    }, 5 * 60 * 1000);
    console.log('[CRM SYNC] Pending adjustment checker scheduled every 5 minutes.');
}

export async function syncPendingAdjustmentTickets() {
    if (crmPendingSyncJobRunning) return { skipped: true };
    crmPendingSyncJobRunning = true;
    try {
        const pool = await getTicketPool();
        const pending = await pool.request().query(`
            SELECT t.ticket_id AS ticket_ref, q.*
            FROM CRM_TICKETS t
            JOIN CRM_TICKET_QUEUE_TEMP q ON q.ticket_id = t.ticket_id
            WHERE t.status = 'Synchronization Pending'
              AND ISNULL(q.sync_status, 'PENDING') <> 'SYNCED'
        `);
        let completed = 0;
        for (const row of pending.recordset) {
            let targetPool;
            try {
                targetPool = await resolveOrgTargetPool(row.rl_itq_org_cd);
                const billNoClean = String(row.rl_itq_bill_no || '').trim();
                const result = await targetPool.request()
                    .input('bill_no', sql.VarChar, billNoClean)
                    .query(`
                        SELECT TOP 1 PROCESSED_FLAG AS processed_flag, EXTRA_INFO_1 AS extra_info_1
                        FROM RXL_LOYALTY_INTEG_TRANS_QUEUE WITH (NOLOCK)
                        WHERE LTRIM(RTRIM(RLITQ_BILL_NO)) = @bill_no
                        ORDER BY CASE
                            WHEN ISNULL(PROCESSED_FLAG, 0) = 1
                                 AND UPPER(LTRIM(RTRIM(ISNULL(EXTRA_INFO_1, '')))) LIKE '%OK%' THEN 0
                            WHEN ISNULL(PROCESSED_FLAG, 0) = -1
                                 AND UPPER(LTRIM(RTRIM(ISNULL(EXTRA_INFO_1, '')))) LIKE '%DUPLICATE%' THEN 0
                            ELSE 1
                        END, TXN_TIMESTAMP DESC
                    `);
                const queueRow = result.recordset[0];
                const flag = Number(queueRow?.processed_flag);
                const extra = String(queueRow?.extra_info_1 || '').trim().toUpperCase();
                const isSynced = (flag === 1 && extra.includes('OK')) ||
                    (flag === -1 && extra.includes('DUPLICATE'));
                if (!isSynced) continue;

                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    await new sql.Request(tx)
                        .input('ticket_id', sql.VarChar, row.ticket_ref)
                        .input('flag', sql.Int, flag)
                        .input('extra', sql.VarChar, queueRow.extra_info_1 || '')
                        .query(`
                            UPDATE CRM_TICKETS
                            SET status = 'Completed / Sync / Closed', updated_at = GETDATE(), closed_at = GETDATE()
                            WHERE ticket_id = @ticket_id AND status = 'Synchronization Pending';
                            UPDATE CRM_TICKET_QUEUE_TEMP
                            SET sync_status = 'SYNCED', processed_flag = @flag, extra_info_1 = @extra,
                                sync_error = NULL, synced_at = GETDATE(), updated_at = GETDATE()
                            WHERE ticket_id = @ticket_id;
                            INSERT INTO CRM_TICKET_AUDIT_LOGS
                                (ticket_id, action, actor_id, actor_name, details)
                            VALUES (@ticket_id, 'SYNCHRONIZED', 'SYSTEM', 'CRM Sync Scheduler',
                                CONCAT('Queue bill ', @ticket_id, ' sudah sinkron. processed_flag=', @flag, ', extra_info_1=', @extra));
                        `);
                    await tx.commit();
                    completed += 1;
                } catch (error) {
                    await tx.rollback();
                    throw error;
                }
            } catch (error) {
                console.warn(`[CRM SYNC] Ticket ${row.ticket_ref} belum dapat diperiksa:`, error.message);
            } finally {
                if (targetPool) await targetPool.close().catch(() => {});
            }
        }
        if (pending.recordset.length > 0) {
            console.log(`[CRM SYNC] Checked ${pending.recordset.length} pending ticket(s), completed ${completed}.`);
        }
        return { checked: pending.recordset.length, completed };
    } finally {
        crmPendingSyncJobRunning = false;
    }
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

// Active Ticket Creations in-flight lock to prevent concurrent duplicate submissions
const activeTicketCreations = new Set();

// Generates unique Ticket ID: TKT-YYMMDD-XXX
async function generateTicketId(runner) {
    const today = new Date();
    const prefix = 'TKT-' + today.toISOString().slice(2, 10).replace(/-/g, '') + '-';
    
    const result = await runner.request()
        .input('prefix', sql.VarChar, prefix + '%')
        .query(`
            SELECT TOP 1 ticket_id FROM CRM_TICKETS WITH (UPDLOCK, HOLDLOCK)
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

    if (!customer_id || !request_type) {
        return res.status(400).json({ error: 'customer_id and request_type are required' });
    }

    const userId = req.headers['x-user-id'] || requester_id || 'anonymous';
    const targetRef = details?.[0]?.transaction_ref ? String(details[0].transaction_ref).trim() : '';
    const billingRef = (request_type === 'POINT_ADJUSTMENT' && targetRef) ? targetRef : '';

    const lockKeys = [
        `user:${userId}`,
        `customer:${request_type}:${customer_id}`,
        ...(request_type === 'MERGE_POINTS' && targetRef ? [`target:MERGE_POINTS:${targetRef}`] : []),
        ...(billingRef ? [`billing:${billingRef}`] : [])
    ];

    // Check if another identical / related ticket creation is already in-flight
    for (const key of lockKeys) {
        if (activeTicketCreations.has(key)) {
            return res.status(429).json({
                error: 'Permintaan pembuatan tiket sedang diproses. Mohon tunggu dan jangan klik submit berulang kali.'
            });
        }
    }

    for (const key of lockKeys) {
        activeTicketCreations.add(key);
    }
    
    try {
        const pool = await getTicketPool();
        const requester = await getActorUser(pool, req);
        const config = await getEffectiveWorkflowConfig(pool, request_type);
        const workflow = initialTicketWorkflow(requester, config);
        const effectiveRequesterId = requester.username;
        const effectiveRequesterName = requester.full_name || requester.username;
        let normalizedDetails = details;

        // Anti-duplicate debounce: check if a ticket for this customer & type was created within the last 15 seconds
        const recentTicketCheck = await pool.request()
            .input('customer_id', sql.VarChar, customer_id)
            .input('request_type', sql.VarChar, request_type)
            .query(`
                SELECT TOP 1 ticket_id, created_at, status
                FROM CRM_TICKETS
                WHERE customer_id = @customer_id
                  AND request_type = @request_type
                  AND DATEDIFF(second, created_at, GETDATE()) < 15
                ORDER BY created_at DESC
            `);

        if (recentTicketCheck.recordset.length > 0) {
            const recent = recentTicketCheck.recordset[0];
            return res.status(409).json({
                error: `Tiket serupa (${recent.ticket_id}) baru saja dibuat beberapa detik yang lalu. Mohon tunggu sebelum membuat tiket baru.`
            });
        }

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
            if (isImmutableDataUpdateField(detail.field_name)) {
                return res.status(400).json({
                    code: 'IMMUTABLE_FIELD',
                    error: 'card_no tidak dapat diubah.'
                });
            }

            // Check if there's already an active (uncompleted) DATA_UPDATE ticket for this customer and field
            const pendingUpdate = await pool.request()
                .input('customer_id', sql.VarChar, customer_id)
                .input('field_name', sql.VarChar, detail.field_name)
                .query(`
                    SELECT TOP 1 t.ticket_id, t.status
                    FROM CRM_TICKETS t
                    JOIN CRM_TICKET_DETAILS d ON t.ticket_id = d.ticket_id
                    WHERE t.customer_id = @customer_id
                      AND t.request_type = 'DATA_UPDATE'
                      AND d.field_name = @field_name
                      AND t.status NOT IN ('Completed / Closed', 'Completed / Sync / Closed', 'Rejected', 'Cancelled')
                    ORDER BY t.created_at DESC
                `);
            if (pendingUpdate.recordset.length > 0) {
                return res.status(409).json({
                    error: `Sudah ada tiket aktif (${pendingUpdate.recordset[0].ticket_id}) untuk pembaruan data ${detail.field_name} pada customer ini dengan status "${pendingUpdate.recordset[0].status}".`
                });
            }

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

            // Also check if target_member is currently an active source in another merge
            const targetAsSource = await pool.request()
                .input('target_member', sql.VarChar, details[0].transaction_ref)
                .query(`
                    SELECT TOP 1 ticket_id, status
                    FROM CRM_TICKETS
                    WHERE customer_id = @target_member
                      AND request_type = 'MERGE_POINTS'
                      AND status NOT IN ('Rejected', 'Cancelled')
                    ORDER BY created_at DESC
                `);
            if (targetAsSource.recordset.length > 0) {
                return res.status(409).json({
                    error: `Member tujuan ${details[0].transaction_ref} sedang diajukan sebagai member sumber pada tiket lain (${targetAsSource.recordset[0].ticket_id}).`
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
        
        // Start transaction
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
            // Re-verify inside the transaction with HOLDLOCK to guarantee serializability
            if (request_type === 'MERGE_POINTS') {
                const doubleCheckMerge = await new sql.Request(transaction)
                    .input('chk_source', sql.VarChar, customer_id)
                    .query(`
                        SELECT TOP 1 ticket_id 
                        FROM CRM_TICKETS WITH (UPDLOCK, HOLDLOCK)
                        WHERE customer_id = @chk_source AND request_type = 'MERGE_POINTS'
                    `);
                if (doubleCheckMerge.recordset.length > 0) {
                    throw new Error(`Member sumber ${customer_id} sudah terdaftar dalam tiket Merge Points (${doubleCheckMerge.recordset[0].ticket_id}).`);
                }
            } else if (request_type === 'POINT_ADJUSTMENT' && normalizedDetails?.[0]?.transaction_ref) {
                const doubleCheckBill = await new sql.Request(transaction)
                    .input('chk_ref', sql.VarChar, normalizedDetails[0].transaction_ref)
                    .query(`
                        SELECT TOP 1 ticket_id 
                        FROM CRM_TICKET_DETAILS WITH (UPDLOCK, HOLDLOCK)
                        WHERE transaction_ref = @chk_ref
                    `);
                if (doubleCheckBill.recordset.length > 0) {
                    throw new Error(`Nomor billing ${normalizedDetails[0].transaction_ref} sudah terdaftar dalam tiket ${doubleCheckBill.recordset[0].ticket_id}.`);
                }
            }

            const ticket_id = await generateTicketId(transaction);
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
                    .input('comments', sql.NVarChar, 'Requester level auto-skip: approval Level 1 dianggap sudah terpenuhi.')
                    .input('approval_level', sql.Int, 1)
                    .query(`
                        INSERT INTO CRM_TICKET_APPROVALS
                        (ticket_id, approver_id, approver_name, approver_role, status, comments, approval_level)
                        VALUES (@ticket_id, @approver_id, @approver_name, @approver_role, @status, @comments, @approval_level)
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

            if (request_type === 'POINT_ADJUSTMENT' && normalizedDetails?.[0]) {
                await stageMissingAdjustmentQueue(transaction, ticket_id, normalizedDetails[0], customer_id);
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
    } finally {
        for (const key of lockKeys) {
            activeTicketCreations.delete(key);
        }
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
        const userMapData = await getUserFullNameMap(pool);
        const configsRes = await pool.request().query('SELECT * FROM CRM_TICKET_WORKFLOW_CONFIG');
        const configMap = new Map();
        for (const c of configsRes.recordset) {
            try {
                c.level_1_users = typeof c.level_1_users === 'string' ? JSON.parse(c.level_1_users) : (c.level_1_users || []);
                c.level_2_users = typeof c.level_2_users === 'string' ? JSON.parse(c.level_2_users) : (c.level_2_users || []);
                c.level_3_users = typeof c.level_3_users === 'string' ? JSON.parse(c.level_3_users) : (c.level_3_users || []);
                c.executor_users = typeof c.executor_users === 'string' ? JSON.parse(c.executor_users) : (c.executor_users || []);
            } catch (_) {}
            configMap.set(c.config_key, c);
        }
        const defaultConfig = configMap.get('DEFAULT');

        for (const t of result.recordset) {
            if (t.requester_name) {
                t.requester_name = userMapData.map.get(t.requester_name.toLowerCase()) || t.requester_name;
            } else if (t.requester_id) {
                t.requester_name = userMapData.map.get(t.requester_id.toLowerCase()) || t.requester_id;
            }

            const config = configMap.get(t.request_type) || defaultConfig;
            const pendingName = getPendingApproverNames(t, config, userMapData);
            t.pending_approver_name = pendingName;
        }

        res.json(result.recordset);
    } catch (err) {
        console.error("getTickets error:", err);
        res.status(500).json({ error: err.message });
    }
};

function extractSnapshotFromAuditLogs(ticket, details, auditLogs) {
    if (!ticket || ticket.request_type !== 'MERGE_POINTS') return null;
    const detail = details?.[0];
    const sourceCard = ticket.customer_id;
    const targetCard = detail?.transaction_ref;
    const pts = Number(detail?.new_value || 0);

    const execLog = auditLogs?.find(l => l.action === 'EXECUTED' && l.details?.includes('Merge Points Berhasil'));
    if (execLog && execLog.details) {
        const text = execLog.details;
        const sourcePtsMatch = text.match(/source\s+(\d+)\s+pts/i);
        const targetPtsMatch = text.match(/(?:target|member tujuan:?)\s+(\d+)\s*(?:pts|poin)/i);
        const sourceExpMatch = text.match(/Source expense=([\d.]+)/i);
        const sourceLdMatch = text.match(/source lucky draw=([\d.]+)/i);
        const targetExpMatch = text.match(/target expense=([\d.]+)/i);
        const targetLdMatch = text.match(/target lucky draw=([\d.]+)/i);

        const sourcePoints = sourcePtsMatch ? Number(sourcePtsMatch[1]) : Number(detail?.old_value || 0);
        const targetPoints = targetPtsMatch ? Number(targetPtsMatch[1]) : 0;
        const sourceExpense = sourceExpMatch ? Number(sourceExpMatch[1]) : 0;
        const sourceLuckyDraw = sourceLdMatch ? Number(sourceLdMatch[1]) : 0;
        const targetExpense = targetExpMatch ? Number(targetExpMatch[1]) : 0;
        const targetLuckyDraw = targetLdMatch ? Number(targetLdMatch[1]) : 0;

        return {
            source: {
                card_no: sourceCard,
                customer_name: ticket.customer_name || null,
                current_points: sourcePoints,
                total_expense: sourceExpense,
                lucky_draw_points: sourceLuckyDraw
            },
            target: {
                card_no: targetCard,
                customer_name: null,
                current_points: targetPoints,
                total_expense: targetExpense,
                lucky_draw_points: targetLuckyDraw
            },
            combined: {
                transferred_points: pts,
                source_points: sourcePoints,
                target_points: targetPoints,
                total_points: targetPoints + pts,
                combined_points: sourcePoints + targetPoints,
                source_expense: sourceExpense,
                target_expense: targetExpense,
                total_expense: sourceExpense + targetExpense,
                source_lucky_draw: sourceLuckyDraw,
                target_lucky_draw: targetLuckyDraw,
                total_lucky_draw: sourceLuckyDraw + targetLuckyDraw
            },
            executed_at: execLog.created_at,
            is_snapshot: true
        };
    }
    return null;
}

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

        const userMapData = await getUserFullNameMap(pool);
        const ticketObj = ticketRes.recordset[0];

        if (ticketObj.requester_name) {
            ticketObj.requester_name = userMapData.map.get(ticketObj.requester_name.toLowerCase()) || ticketObj.requester_name;
        } else if (ticketObj.requester_id) {
            ticketObj.requester_name = userMapData.map.get(ticketObj.requester_id.toLowerCase()) || ticketObj.requester_id;
        }

        const config = await getEffectiveWorkflowConfig(pool, ticketObj.request_type);
        const pendingName = getPendingApproverNames(ticketObj, config, userMapData);
        ticketObj.pending_approver_name = pendingName;

        for (const app of approvalsRes.recordset) {
            if (app.approver_name) {
                app.approver_name = userMapData.map.get(app.approver_name.toLowerCase()) || app.approver_name;
            } else if (app.approver_id) {
                app.approver_name = userMapData.map.get(app.approver_id.toLowerCase()) || app.approver_id;
            }
        }

        let mergeH2h = null;
        if (ticketObj.request_type === 'MERGE_POINTS' && detailsRes.recordset[0]) {
            const statusLower = String(ticketObj.status || '').toLowerCase();
            const isClosed = statusLower.includes('completed') || statusLower.includes('closed') || statusLower.includes('reject');

            if (isClosed) {
                // Tiket sudah selesai / closed: gunakan snapshot data historis statis.
                // Jangan panggil API H2H live agar data history tidak terus berubah dinamis.
                let snapshot = null;
                if (ticketObj.snapshot_data) {
                    try {
                        snapshot = JSON.parse(ticketObj.snapshot_data);
                    } catch (_) {}
                }
                if (!snapshot) {
                    snapshot = extractSnapshotFromAuditLogs(ticketObj, detailsRes.recordset, logsRes.recordset);
                }
                if (snapshot) {
                    mergeH2h = {
                        ...snapshot,
                        is_snapshot: true,
                        checked_at: snapshot.executed_at || ticketObj.closed_at || ticketObj.updated_at
                    };
                }
            }

            // Jika tiket BELUM close (masih aktif / pending approval / approved) ATAU belum memiliki snapshot:
            if (!mergeH2h) {
                const sourceIdentifier = ticketObj.customer_id;
                const targetIdentifier = detailsRes.recordset[0].transaction_ref;
                const [sourceResult, targetResult] = await Promise.allSettled([
                    getH2hMemberSnapshot(sourceIdentifier),
                    getH2hMemberSnapshot(targetIdentifier)
                ]);
                const source = sourceResult.status === 'fulfilled' ? sourceResult.value : null;
                const target = targetResult.status === 'fulfilled' ? targetResult.value : null;

                const sourcePoints = Number(source?.current_points ?? detailsRes.recordset[0]?.old_value ?? 0);
                const targetPoints = Number(target?.current_points ?? 0);
                const transferredPoints = Number(detailsRes.recordset[0]?.new_value ?? sourcePoints);

                const sourceExpense = Number(source?.total_expense ?? 0);
                const targetExpense = Number(target?.total_expense ?? 0);

                const sourceLuckyDraw = Number(source?.lucky_draw_points ?? 0);
                const targetLuckyDraw = Number(target?.lucky_draw_points ?? 0);

                const combined = {
                    source_points: sourcePoints,
                    target_points: targetPoints,
                    transferred_points: transferredPoints,
                    total_points: targetPoints + transferredPoints,
                    combined_points: sourcePoints + targetPoints,
                    source_expense: sourceExpense,
                    target_expense: targetExpense,
                    total_expense: sourceExpense + targetExpense,
                    source_lucky_draw: sourceLuckyDraw,
                    target_lucky_draw: targetLuckyDraw,
                    total_lucky_draw: sourceLuckyDraw + targetLuckyDraw
                };

                mergeH2h = {
                    source,
                    target,
                    combined,
                    is_snapshot: false,
                    errors: {
                        source: sourceResult.status === 'rejected' ? sourceResult.reason?.message : null,
                        target: targetResult.status === 'rejected' ? targetResult.reason?.message : null
                    },
                    checked_at: new Date().toISOString()
                };
            }
        }

        let permissions = { can_approve: false, can_execute: false };
        try {
            const actor = await getActorUser(pool, req);
            const approveCheck = canUserApproveTicket(actor, ticketObj, config, pendingName);
            const canExec = canUserExecuteTicket(actor, config);
            permissions = {
                can_approve: approveCheck.allowed,
                can_execute: canExec && ticketObj.status === 'Approved',
                approve_reason: approveCheck.reason,
                pending_approver_name: pendingName,
                total_levels: config.total_levels,
                level_name: pendingName ? `Pending: ${pendingName}` : (ticketObj.status.includes('Pending Approval') ? 'Pending Approval' : ticketObj.status)
            };
        } catch (_) {}

        res.json({
            ticket: ticketObj,
            details: detailsRes.recordset,
            approvals: approvalsRes.recordset,
            logs: logsRes.recordset,
            merge_h2h: mergeH2h,
            permissions
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
        const userMapData = await getUserFullNameMap(pool);
        const actor = await getActorUser(pool, req);
        const config = await getEffectiveWorkflowConfig(pool, ticket.request_type);
        const pendingName = getPendingApproverNames(ticket, config, userMapData);

        const checkAuth = canUserApproveTicket(actor, ticket, config, pendingName);
        if (!checkAuth.allowed) {
            return res.status(403).json({
                error: checkAuth.reason || `Menunggu approval dari: ${pendingName || 'approver terkait'}.`
            });
        }

        let newStatus = ticket.status;
        let newLevel = Number(ticket.current_approval_level);

        if (action === 'REJECT') {
            newStatus = 'Rejected';
        } else if (action === 'RETURN') {
            newStatus = 'Need Information';
            newLevel = 0; // Return to requester/helpdesk
        } else if (action === 'APPROVE') {
            const totalLevels = config.total_levels || 2;
            if (newLevel < totalLevels) {
                newLevel = newLevel + 1;
                newStatus = `Pending Approval L${newLevel}`;
            } else {
                newLevel = totalLevels;
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

            if (ticket.request_type === 'POINT_ADJUSTMENT') {
                await new sql.Request(transaction)
                    .input('ticket_id', sql.VarChar, id)
                    .input('sync_status', sql.VarChar, action === 'REJECT' ? 'REJECTED' : action === 'RETURN' ? 'RETURNED' : 'PENDING')
                    .query(`UPDATE CRM_TICKET_QUEUE_TEMP SET sync_status = @sync_status, updated_at = GETDATE() WHERE ticket_id = @ticket_id`);
            }
                
            const reqApp = new sql.Request(transaction);
            await reqApp
                .input('ticket_id', sql.VarChar, id)
                .input('approver_id', sql.VarChar, actor.username)
                .input('approver_name', sql.VarChar, actor.full_name || actor.username)
                .input('approver_role', sql.VarChar, actor.role_name || actor.division || 'Unknown')
                .input('status', sql.VarChar, action)
                .input('comments', sql.NVarChar, comments || '')
                .input('approval_level', sql.Int, ticket.current_approval_level)
                .query(`
                    INSERT INTO CRM_TICKET_APPROVALS 
                    (ticket_id, approver_id, approver_name, approver_role, status, comments, approval_level)
                    VALUES (@ticket_id, @approver_id, @approver_name, @approver_role, @status, @comments, @approval_level)
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

        if (request_type === 'DATA_UPDATE' && normalizedDetails && normalizedDetails.length > 0) {
            const detail = normalizedDetails[0];
            if (isImmutableDataUpdateField(detail.field_name)) {
                return res.status(400).json({
                    code: 'IMMUTABLE_FIELD',
                    error: 'card_no tidak dapat diubah.'
                });
            }
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
        const config = await getEffectiveWorkflowConfig(pool, request_type);
        const workflow = initialTicketWorkflow(actor, config);
        
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
                    .input('comments', sql.NVarChar, 'Requester level auto-skip: approval Level 1 dianggap sudah terpenuhi saat resubmit.')
                    .input('approval_level', sql.Int, 1)
                    .query(`
                        INSERT INTO CRM_TICKET_APPROVALS
                        (ticket_id, approver_id, approver_name, approver_role, status, comments, approval_level)
                        VALUES (@ticket_id, @approver_id, @approver_name, @approver_role, @status, @comments, @approval_level)
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

            if (request_type === 'POINT_ADJUSTMENT' && normalizedDetails?.[0]) {
                await stageMissingAdjustmentQueue(transaction, id, normalizedDetails[0], currentTicket.recordset[0].customer_id);
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
            for (const table of ['CRM_TICKET_QUEUE_TEMP', 'CRM_TICKET_APPROVALS', 'CRM_TICKET_DETAILS', 'CRM_TICKET_AUDIT_LOGS']) {
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

        // 1. Fetch ticket and details
        const ticketRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKETS WHERE ticket_id = @ticket_id");
        
        if (ticketRes.recordset.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        const ticket = ticketRes.recordset[0];

        const config = await getEffectiveWorkflowConfig(pool, ticket.request_type);
        if (!canUserExecuteTicket(executor, config)) {
            return res.status(403).json({ error: 'Execute ticket hanya dapat dilakukan oleh user yang terdaftar dalam akses eksekusi CRM (Executors).' });
        }

        if (ticket.status !== 'Approved') {
            return res.status(409).json({ error: `Ticket belum siap dieksekusi. Status saat ini: ${ticket.status}.` });
        }

        const detailsRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKET_DETAILS WHERE ticket_id = @ticket_id");
        const details = detailsRes.recordset;

        let executionNotes = `Executed. Notes: ${result_notes || '-'}`;
        let executionSyncPending = false;
        let executedSnapshotJson = null;

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

                    executedSnapshotJson = JSON.stringify({
                        source: {
                            card_no: sourceCard,
                            customer_name: ticket.customer_name || sourceH2h.customer_name || null,
                            current_points: sourceH2h.current_points,
                            total_expense: sourceH2h.total_expense,
                            lucky_draw_points: sourceH2h.lucky_draw_points
                        },
                        target: {
                            card_no: targetCard,
                            customer_name: targetH2h.customer_name || null,
                            current_points: targetH2h.current_points,
                            total_expense: targetH2h.total_expense,
                            lucky_draw_points: targetH2h.lucky_draw_points
                        },
                        combined: {
                            transferred_points: pts,
                            source_points: sourceH2h.current_points,
                            target_points: targetH2h.current_points,
                            total_points: targetH2h.current_points + pts,
                            combined_points: sourceH2h.current_points + targetH2h.current_points,
                            source_expense: sourceH2h.total_expense,
                            target_expense: targetH2h.total_expense,
                            total_expense: sourceH2h.total_expense + targetH2h.total_expense,
                            source_lucky_draw: sourceH2h.lucky_draw_points,
                            target_lucky_draw: targetH2h.lucky_draw_points,
                            total_lucky_draw: sourceH2h.lucky_draw_points + targetH2h.lucky_draw_points
                        },
                        executed_at: new Date().toISOString(),
                        is_snapshot: true
                    });
                } catch (e55) {
                    console.error("Failed to execute Merge Points in DBWH_8555:", e55);
                    throw e55;
                }
            }
        } else if (ticket.request_type === 'POINT_ADJUSTMENT' && details.length > 0) {
            const detail = details[0];
            const adjustmentBillNo = String(detail.transaction_ref || '').trim();
            let stagedAdjustment = null;
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
                const stagedResult = await pool.request()
                    .input('ticket_id', sql.VarChar, id)
                    .query(`SELECT TOP 1 * FROM CRM_TICKET_QUEUE_TEMP WHERE ticket_id = @ticket_id AND ISNULL(sync_status, 'PENDING') <> 'SYNCED'`);
                stagedAdjustment = stagedResult.recordset[0] || null;
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
                if (!stagedAdjustment && (!billRow || ![1, -1].includes(processedFlag))) {
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

            const oldPts = safeParsePoints(detail.old_value);
            const newPts = safeParsePoints(detail.new_value);
            const targetLatestPoints = oldPts + newPts;

            const memberIdentifier = ticket.mobile_no || ticket.customer_id;
            let h2hPoints = null;
            try {
                h2hPoints = await getH2hMemberPoints(memberIdentifier);
            } catch (h2hError) {
                console.warn("H2H point lookup note:", h2hError.message);
            }

            try {
                const p55 = await getCustomerLookupPool();
                await p55.request()
                    .input('card', sql.VarChar, ticket.customer_id)
                    .input('targetPoints', sql.Int, targetLatestPoints)
                    .query(`
                        UPDATE RXL_LOYALID_CUSTOMER_MST
                        SET LATEST_POINT = @targetPoints,
                            UPDATED_AT = GETDATE()
                        WHERE RLICM_CARD_NO = @card OR RLICM_MOBILE_NO = @card
                    `);
                executionNotes = `Point Adjustment Berhasil: LATEST_POINT pada ${ticket.customer_id} disesuaikan menjadi ${targetLatestPoints} (${oldPts} + ${newPts} pts).${h2hPoints !== null ? ` (Snapshot H2H: ${h2hPoints} pts)` : ''} Notes: ${result_notes || '-'}`;
            } catch (e55) {
                console.error("Failed to execute Point Adjustment in DBWH_8555:", e55);
                throw e55;
            }

            if (stagedAdjustment) {
                try {
                    // Always re-apply the card submitted on the ticket before sending
                    // the temporary queue row; this also repairs older staged rows.
                    await pool.request()
                        .input('ticket_id', sql.VarChar, id)
                        .input('card_no', sql.VarChar, ticket.customer_id)
                        .query(`
                            UPDATE CRM_TICKET_QUEUE_TEMP
                            SET rl_itq_card_no = @card_no, updated_at = GETDATE()
                            WHERE ticket_id = @ticket_id
                        `);
                    const pushResult = await pushStagedAdjustment(pool, id);
                    if (pushResult?.already_synced) {
                        executionSyncPending = false;
                        executionNotes += ` Queue pada server target dilewati karena bill_no ${adjustmentBillNo} sudah ada dan telah tersinkronisasi (flag=${pushResult.existing_queue?.processed_flag}, extra=${pushResult.existing_queue?.extra_info_1 || '-'}).`;
                    } else if (pushResult?.already_existed) {
                        executionSyncPending = true;
                        executionNotes += ` Queue pada server target dilewati karena bill_no ${adjustmentBillNo} sudah ada di antrean server target (status: pending, flag=${pushResult.existing_queue?.processed_flag ?? 0}).`;
                    } else {
                        executionSyncPending = true;
                        executionNotes += ' Temporary queue berhasil dikirim ke server tujuan berdasarkan org_cd.';
                    }
                } catch (queueError) {
                    await logValidationFailure(pool, id, executor_id, executor_name, `POINT_ADJUSTMENT temporary queue push failed. bill_no=${adjustmentBillNo}, error=${queueError.message}`);
                    return res.status(queueError.statusCode || 502).json({
                        error: queueError.message,
                        code: queueError.code || 'QUEUE_TARGET_INSERT_ERROR'
                    });
                }
            }
        } else if (ticket.request_type === 'DATA_UPDATE' && details.length > 0) {
            const detail = details[0];
            if (detail.field_name && detail.new_value) {
                if (isImmutableDataUpdateField(detail.field_name)) {
                    const message = 'Execute DATA_UPDATE ditolak: card_no tidak dapat diubah.';
                    await logValidationFailure(pool, id, executor_id, executor_name, message);
                    return res.status(400).json({
                        code: 'IMMUTABLE_FIELD',
                        error: message
                    });
                }

                // customer_id is the immutable card number stored on the ticket.
                // H2H customer lookup must be keyed by card_no, not mobile_no.
                const memberIdentifier = ticket.customer_id;
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
                                WHERE RLICM_CARD_NO = @card
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
                .input('status', sql.VarChar, executionSyncPending ? 'Synchronization Pending' : 'Completed / Closed')
                .input('snapshot_data', sql.NVarChar, executedSnapshotJson)
                .query(`
                    UPDATE CRM_TICKETS 
                    SET status = @status, 
                        snapshot_data = ISNULL(@snapshot_data, snapshot_data),
                        updated_at = GETDATE(), 
                        closed_at = CASE WHEN @status = 'Completed / Closed' THEN GETDATE() ELSE NULL END
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
                status: executionSyncPending ? 'Synchronization Pending' : 'Completed / Closed',
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

        if (memberTransaction.is_already_synced) {
            return res.status(409).json({
                code: 'BILL_ALREADY_SYNC',
                error: `Bill ${billing} sudah terproses sebagai transaksi member, data sudah tersyncrone dan tidak bisa diajukan kembali sebagai ticket.`,
                billing,
                member_transaction_found: true,
                transmition_type: memberTransaction.transmition_type,
                processed_flag: memberTransaction.processed_flag,
                extra_info_1: memberTransaction.extra_info_1,
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
            processed_flag: memberTransaction.processed_flag,
            extra_info_1: memberTransaction.extra_info_1,
            automatic_remark: memberTransaction.automatic_remark,
            can_submit: memberTransaction.can_submit
        });
    } catch (err) {
        console.error('Billing lookup error:', err.message);
        res.status(500).json({ error: 'Gagal membaca net value billing dari pepito_ho.', details: err.message });
    } finally {
        if (hoPool) await hoPool.close().catch(() => {});
    }
};

export const getApprovalWorkflowConfig = async (req, res) => {
    try {
        const pool = await getTicketPool();
        const config = await getEffectiveWorkflowConfig(pool, 'DEFAULT');

        const usersRes = await pool.request().query(`
            SELECT u.id, u.username, u.full_name, u.division, u.position, r.name AS role_name
            FROM Users u
            LEFT JOIN Roles r ON r.id = u.role_id
            ORDER BY u.full_name ASC, u.username ASC
        `);

        const rolesRes = await pool.request().query(`
            SELECT id, name FROM Roles ORDER BY name ASC
        `);

        res.json({
            success: true,
            config,
            users: usersRes.recordset,
            roles: rolesRes.recordset
        });
    } catch (err) {
        console.error('getApprovalWorkflowConfig error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const updateApprovalWorkflowConfig = async (req, res) => {
    try {
        const pool = await getTicketPool();
        const actor = await getActorUser(pool, req);
        if (!actor.is_admin) {
            return res.status(403).json({ error: 'Hanya Administrator yang berwenang mengubah konfigurasi workflow approval.' });
        }

        const {
            config_key = 'DEFAULT',
            total_levels = 2,
            level_1_name = 'Level 1 - Supervisor / Team Leader',
            level_1_users = [],
            level_2_name = 'Level 2 - Department Head / Marketing',
            level_2_users = [],
            level_3_name = 'Level 3 - Director / Management',
            level_3_users = [],
            executor_users = [],
            auto_skip_requester_level = true,
            allow_admin_override = true
        } = req.body;

        const safeLevels = Math.min(Math.max(Number(total_levels) || 2, 1), 3);

        await pool.request()
            .input('config_key', sql.VarChar, config_key)
            .input('total_levels', sql.Int, safeLevels)
            .input('level_1_name', sql.NVarChar, level_1_name)
            .input('level_1_users', sql.NVarChar, JSON.stringify(level_1_users || []))
            .input('level_2_name', sql.NVarChar, level_2_name)
            .input('level_2_users', sql.NVarChar, JSON.stringify(level_2_users || []))
            .input('level_3_name', sql.NVarChar, level_3_name)
            .input('level_3_users', sql.NVarChar, JSON.stringify(level_3_users || []))
            .input('executor_users', sql.NVarChar, JSON.stringify(executor_users || []))
            .input('auto_skip_requester_level', sql.Bit, auto_skip_requester_level ? 1 : 0)
            .input('allow_admin_override', sql.Bit, allow_admin_override ? 1 : 0)
            .input('updated_by', sql.VarChar, actor.username)
            .query(`
                MERGE CRM_TICKET_WORKFLOW_CONFIG AS target
                USING (SELECT @config_key AS config_key) AS source
                ON target.config_key = source.config_key
                WHEN MATCHED THEN UPDATE SET
                    total_levels = @total_levels,
                    level_1_name = @level_1_name,
                    level_1_users = @level_1_users,
                    level_2_name = @level_2_name,
                    level_2_users = @level_2_users,
                    level_3_name = @level_3_name,
                    level_3_users = @level_3_users,
                    executor_users = @executor_users,
                    auto_skip_requester_level = @auto_skip_requester_level,
                    allow_admin_override = @allow_admin_override,
                    updated_by = @updated_by,
                    updated_at = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (config_key, total_levels, level_1_name, level_1_users, level_2_name, level_2_users, level_3_name, level_3_users, executor_users, auto_skip_requester_level, allow_admin_override, updated_by, updated_at)
                VALUES
                    (@config_key, @total_levels, @level_1_name, @level_1_users, @level_2_name, @level_2_users, @level_3_name, @level_3_users, @executor_users, @auto_skip_requester_level, @allow_admin_override, @updated_by, GETDATE());
            `);

        const updatedConfig = await getEffectiveWorkflowConfig(pool, config_key);
        res.json({ success: true, config: updatedConfig });
    } catch (err) {
        console.error('updateApprovalWorkflowConfig error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const recheckTicketH2h = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getTicketPool();
        const ticketRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKETS WHERE ticket_id = @ticket_id");

        if (ticketRes.recordset.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }

        const ticket = ticketRes.recordset[0];
        if (ticket.request_type !== 'MERGE_POINTS') {
            return res.status(400).json({ error: "Pemeriksaan ulang H2H hanya berlaku untuk ticket bertipe MERGE_POINTS" });
        }

        const detailsRes = await pool.request()
            .input('ticket_id', sql.VarChar, id)
            .query("SELECT * FROM CRM_TICKET_DETAILS WHERE ticket_id = @ticket_id");

        if (detailsRes.recordset.length === 0) {
            return res.status(400).json({ error: "Detail ticket tidak ditemukan" });
        }

        const sourceIdentifier = ticket.customer_id;
        const targetIdentifier = detailsRes.recordset[0].transaction_ref;

        if (!sourceIdentifier || !targetIdentifier) {
            return res.status(400).json({ error: "Nomor kartu sumber atau tujuan tidak lengkap pada ticket ini" });
        }

        const [sourceResult, targetResult] = await Promise.allSettled([
            getH2hMemberSnapshot(sourceIdentifier),
            getH2hMemberSnapshot(targetIdentifier)
        ]);

        const source = sourceResult.status === 'fulfilled' ? sourceResult.value : null;
        const target = targetResult.status === 'fulfilled' ? targetResult.value : null;

        const sourcePoints = Number(source?.current_points ?? detailsRes.recordset[0]?.old_value ?? 0);
        const targetPoints = Number(target?.current_points ?? 0);
        const transferredPoints = Number(detailsRes.recordset[0]?.new_value ?? sourcePoints);

        const sourceExpense = Number(source?.total_expense ?? 0);
        const targetExpense = Number(target?.total_expense ?? 0);

        const sourceLuckyDraw = Number(source?.lucky_draw_points ?? 0);
        const targetLuckyDraw = Number(target?.lucky_draw_points ?? 0);

        const combined = {
            source_points: sourcePoints,
            target_points: targetPoints,
            transferred_points: transferredPoints,
            total_points: targetPoints + transferredPoints,
            combined_points: sourcePoints + targetPoints,
            source_expense: sourceExpense,
            target_expense: targetExpense,
            total_expense: sourceExpense + targetExpense,
            source_lucky_draw: sourceLuckyDraw,
            target_lucky_draw: targetLuckyDraw,
            total_lucky_draw: sourceLuckyDraw + targetLuckyDraw
        };

        const mergeH2h = {
            source,
            target,
            combined,
            is_snapshot: false,
            errors: {
                source: sourceResult.status === 'rejected' ? (sourceResult.reason?.message || 'Gagal memuat data H2H member lama') : null,
                target: targetResult.status === 'rejected' ? (targetResult.reason?.message || 'Gagal memuat data H2H member baru') : null
            },
            checked_at: new Date().toISOString()
        };

        const hasSourceError = sourceResult.status === 'rejected';
        const hasTargetError = targetResult.status === 'rejected';

        res.json({
            success: !hasSourceError && !hasTargetError,
            partial: (hasSourceError && !hasTargetError) || (!hasSourceError && hasTargetError),
            merge_h2h: mergeH2h,
            message: (!hasSourceError && !hasTargetError)
                ? 'Data live H2H berhasil diperiksa ulang'
                : `Pemeriksaan H2H mengalami kendala: ${[mergeH2h.errors.source && `Sumber: ${mergeH2h.errors.source}`, mergeH2h.errors.target && `Tujuan: ${mergeH2h.errors.target}`].filter(Boolean).join(' | ')}`
        });
    } catch (err) {
        console.error('recheckTicketH2h error:', err);
        res.status(500).json({ error: err.message });
    }
};
