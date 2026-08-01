"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketManager = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("./config/env");
class SocketManager {
    io = null;
    connectedUsers = new Map();
    storeRooms = new Map();
    staffSockets = new Map(); // staffId -> socketIds
    initialize(httpServer) {
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: env_1.config.corsOrigin,
                methods: ['GET', 'POST'],
                credentials: true
            }
        });
        // Authentication middleware
        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token || socket.handshake.query.token;
            if (!token) {
                return next(new Error('Authentication required'));
            }
            try {
                const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwt.secret);
                socket.data.user = decoded;
                next();
            }
            catch (error) {
                next(new Error('Invalid token'));
            }
        });
        // Connection handler
        this.io.on('connection', (socket) => {
            const user = socket.data.user;
            if (user) {
                this.handleConnection(socket, user);
            }
            // Handle disconnect
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });
        return this.io;
    }
    handleConnection(socket, user) {
        const userInfo = {
            socketId: socket.id,
            userId: user.id,
            staffId: user.staffId,
            storeId: user.storeId,
            role: user.role
        };
        this.connectedUsers.set(socket.id, userInfo);
        // Join store room
        if (user.storeId) {
            socket.join(`store:${user.storeId}`);
            if (!this.storeRooms.has(user.storeId)) {
                this.storeRooms.set(user.storeId, new Set());
            }
            this.storeRooms.get(user.storeId).add(socket.id);
        }
        // Track staff socket for direct messaging
        if (user.staffId) {
            if (!this.staffSockets.has(user.staffId)) {
                this.staffSockets.set(user.staffId, new Set());
            }
            this.staffSockets.get(user.staffId).add(socket.id);
        }
        // Send confirmation
        socket.emit('connected', {
            socketId: socket.id,
            userId: user.id,
            storeId: user.storeId
        });
    }
    handleDisconnect(socket) {
        const userInfo = this.connectedUsers.get(socket.id);
        if (userInfo) {
            // Leave store room
            socket.leave(`store:${userInfo.storeId}`);
            const room = this.storeRooms.get(userInfo.storeId);
            if (room) {
                room.delete(socket.id);
                if (room.size === 0) {
                    this.storeRooms.delete(userInfo.storeId);
                }
            }
            // Remove from staff sockets
            if (userInfo.staffId) {
                const staffRoom = this.staffSockets.get(userInfo.staffId);
                if (staffRoom) {
                    staffRoom.delete(socket.id);
                    if (staffRoom.size === 0) {
                        this.staffSockets.delete(userInfo.staffId);
                    }
                }
            }
            this.connectedUsers.delete(socket.id);
        }
    }
    // Emit new order to store (for KDS)
    emitNewOrder(storeId, order) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit('order:new', {
                type: 'order:new',
                data: order,
                timestamp: new Date().toISOString()
            });
        }
    }
    // Emit order status update
    emitOrderStatusUpdate(storeId, orderId, status) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit('order:status', {
                type: 'order:status',
                data: { orderId, status },
                timestamp: new Date().toISOString()
            });
        }
    }
    // Emit KDS push (for kitchen display)
    emitKDSPush(storeId, order) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit('kds:push', {
                type: 'kds:push',
                data: order,
                timestamp: new Date().toISOString()
            });
        }
    }
    // Emit sync complete notification
    emitSyncComplete(storeId, stats) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit('sync:complete', {
                type: 'sync:complete',
                data: stats,
                timestamp: new Date().toISOString()
            });
        }
    }
    // Emit low stock alert
    emitLowStockAlert(storeId, item) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit('inventory:low-stock', {
                type: 'inventory:low-stock',
                data: item,
                timestamp: new Date().toISOString()
            });
        }
    }
    // Emit delivery order (for delivery hub)
    emitDeliveryOrder(storeId, order) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit('delivery:new', {
                type: 'delivery:new',
                data: order,
                timestamp: new Date().toISOString()
            });
        }
    }
    // Get connected users count for a store
    getStoreUserCount(storeId) {
        return this.storeRooms.get(storeId)?.size || 0;
    }
    // Get all connected users
    getConnectedUsers() {
        return Array.from(this.connectedUsers.values());
    }
    // Broadcast to all users in a store
    broadcastToStore(storeId, event, data) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit(event, data);
        }
    }
    // Emit hygiene task notification
    emitHygieneTask(storeId, task) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit('hygiene:task', {
                type: 'hygiene:task',
                data: task,
                timestamp: new Date().toISOString()
            });
        }
    }
    // Emit hygiene task completed notification
    emitHygieneTaskCompleted(storeId, task) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit('hygiene:completed', {
                type: 'hygiene:completed',
                data: task,
                timestamp: new Date().toISOString()
            });
        }
    }
    // Emit notification to POS display
    emitToPOS(storeId, message, data) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit('pos:notification', {
                type: 'pos:notification',
                data: { message, ...data },
                timestamp: new Date().toISOString()
            });
        }
    }
    // Emit to all users in a store room
    emitToStore(storeId, event, data) {
        if (this.io) {
            this.io.to(`store:${storeId}`).emit(event, {
                type: event,
                data,
                timestamp: new Date().toISOString()
            });
        }
    }
    // Emit to specific staff member
    emitToStaff(staffId, event, data) {
        if (this.io) {
            const socketIds = this.staffSockets.get(staffId);
            if (socketIds) {
                socketIds.forEach(socketId => {
                    this.io.to(socketId).emit(event, {
                        type: event,
                        data,
                        timestamp: new Date().toISOString()
                    });
                });
            }
        }
    }
}
exports.socketManager = new SocketManager();
exports.default = exports.socketManager;
//# sourceMappingURL=socket.js.map