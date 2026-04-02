"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var cors_1 = __importDefault(require("cors"));
var mssql_1 = __importDefault(require("mssql"));
var dotenv_1 = __importDefault(require("dotenv"));
var path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env') });
var app = (0, express_1.default)();
var port = process.env.PORT || 3001;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// SQL Server configuration
var dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false, // For local dev, usually false
        trustServerCertificate: true,
    },
};
// Application State
var poolPromise;
// Attempt to initialize database connection and create table
function initDb() {
    return __awaiter(this, void 0, void 0, function () {
        var pool, createTableQuery, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    poolPromise = mssql_1.default.connect(dbConfig);
                    return [4 /*yield*/, poolPromise];
                case 1:
                    pool = _a.sent();
                    console.log('✅ Connected to SQL Server:', dbConfig.server);
                    createTableQuery = "\n      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Devices' AND xtype='U')\n      CREATE TABLE Devices (\n          id NVARCHAR(50) PRIMARY KEY,\n          hostname NVARCHAR(100) NOT NULL,\n          ip NVARCHAR(50) NOT NULL,\n          os_version NVARCHAR(100),\n          cpu NVARCHAR(100),\n          ram NVARCHAR(50),\n          disk NVARCHAR(50),\n          agent_version NVARCHAR(50),\n          status NVARCHAR(50),\n          last_seen NVARCHAR(50),\n          group_ids NVARCHAR(500) -- Simple string concatenation for simplicity\n      )\n    ";
                    return [4 /*yield*/, pool.request().query(createTableQuery)];
                case 2:
                    _a.sent();
                    console.log('✅ Devices table ready in DBWH_8529');
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    console.error('❌ Database Connection Failed! Bad Config: ', err_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ── GET /api/devices ──────────────────────────────────────
app.get('/api/devices', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var pool, result, devices, err_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, poolPromise];
            case 1:
                pool = _a.sent();
                return [4 /*yield*/, pool.request().query('SELECT * FROM Devices')];
            case 2:
                result = _a.sent();
                devices = result.recordset.map(function (row) { return (__assign(__assign({}, row), { group_ids: row.group_ids ? row.group_ids.split(',').filter(Boolean) : [] })); });
                res.json(devices);
                return [3 /*break*/, 4];
            case 3:
                err_2 = _a.sent();
                res.status(500).json({ error: err_2.message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ── POST /api/devices ─────────────────────────────────────
app.post('/api/devices', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, id, hostname, ip, os_version, cpu, ram, disk, agent_version, status_1, last_seen, group_ids, groupsString, pool, err_3;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                _a = req.body, id = _a.id, hostname = _a.hostname, ip = _a.ip, os_version = _a.os_version, cpu = _a.cpu, ram = _a.ram, disk = _a.disk, agent_version = _a.agent_version, status_1 = _a.status, last_seen = _a.last_seen, group_ids = _a.group_ids;
                groupsString = Array.isArray(group_ids) ? group_ids.join(',') : '';
                return [4 /*yield*/, poolPromise];
            case 1:
                pool = _b.sent();
                return [4 /*yield*/, pool.request()
                        .input('id', mssql_1.default.NVarChar, id)
                        .input('hostname', mssql_1.default.NVarChar, hostname)
                        .input('ip', mssql_1.default.NVarChar, ip)
                        .input('os_version', mssql_1.default.NVarChar, os_version)
                        .input('cpu', mssql_1.default.NVarChar, cpu)
                        .input('ram', mssql_1.default.NVarChar, ram)
                        .input('disk', mssql_1.default.NVarChar, disk)
                        .input('agent_version', mssql_1.default.NVarChar, agent_version)
                        .input('status', mssql_1.default.NVarChar, status_1)
                        .input('last_seen', mssql_1.default.NVarChar, last_seen)
                        .input('group_ids', mssql_1.default.NVarChar, groupsString)
                        .query("\n        INSERT INTO Devices \n        (id, hostname, ip, os_version, cpu, ram, disk, agent_version, status, last_seen, group_ids)\n        VALUES \n        (@id, @hostname, @ip, @os_version, @cpu, @ram, @disk, @agent_version, @status, @last_seen, @group_ids)\n      ")];
            case 2:
                _b.sent();
                res.status(201).json({ message: 'Device created successfully', device: req.body });
                return [3 /*break*/, 4];
            case 3:
                err_3 = _b.sent();
                res.status(500).json({ error: err_3.message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ── PUT /api/devices/:id ──────────────────────────────────
app.put('/api/devices/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, _a, hostname, ip, os_version, cpu, ram, disk, agent_version, status_2, last_seen, group_ids, groupsString, pool, err_4;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                id = req.params.id;
                _a = req.body, hostname = _a.hostname, ip = _a.ip, os_version = _a.os_version, cpu = _a.cpu, ram = _a.ram, disk = _a.disk, agent_version = _a.agent_version, status_2 = _a.status, last_seen = _a.last_seen, group_ids = _a.group_ids;
                groupsString = Array.isArray(group_ids) ? group_ids.join(',') : '';
                return [4 /*yield*/, poolPromise];
            case 1:
                pool = _b.sent();
                return [4 /*yield*/, pool.request()
                        .input('id', mssql_1.default.NVarChar, id)
                        .input('hostname', mssql_1.default.NVarChar, hostname)
                        .input('ip', mssql_1.default.NVarChar, ip)
                        .input('os_version', mssql_1.default.NVarChar, os_version)
                        .input('cpu', mssql_1.default.NVarChar, cpu)
                        .input('ram', mssql_1.default.NVarChar, ram)
                        .input('disk', mssql_1.default.NVarChar, disk)
                        .input('agent_version', mssql_1.default.NVarChar, agent_version)
                        .input('status', mssql_1.default.NVarChar, status_2)
                        .input('last_seen', mssql_1.default.NVarChar, last_seen)
                        .input('group_ids', mssql_1.default.NVarChar, groupsString)
                        .query("\n        UPDATE Devices \n        SET hostname=@hostname, ip=@ip, os_version=@os_version, cpu=@cpu, \n            ram=@ram, disk=@disk, agent_version=@agent_version, status=@status, \n            last_seen=@last_seen, group_ids=@group_ids\n        WHERE id=@id\n      ")];
            case 2:
                _b.sent();
                res.json({ message: 'Device updated successfully', device: __assign(__assign({}, req.body), { id: id }) });
                return [3 /*break*/, 4];
            case 3:
                err_4 = _b.sent();
                res.status(500).json({ error: err_4.message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ── DELETE /api/devices/:id ───────────────────────────────
app.delete('/api/devices/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, pool, err_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                id = req.params.id;
                return [4 /*yield*/, poolPromise];
            case 1:
                pool = _a.sent();
                return [4 /*yield*/, pool.request()
                        .input('id', mssql_1.default.NVarChar, id)
                        .query('DELETE FROM Devices WHERE id=@id')];
            case 2:
                _a.sent();
                res.json({ message: 'Device deleted successfully' });
                return [3 /*break*/, 4];
            case 3:
                err_5 = _a.sent();
                res.status(500).json({ error: err_5.message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Start the server
app.listen(port, function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        console.log("\uD83D\uDE80 Server running on http://localhost:${port}`);\n  await initDb();\n});\n");
        return [2 /*return*/];
    });
}); });
