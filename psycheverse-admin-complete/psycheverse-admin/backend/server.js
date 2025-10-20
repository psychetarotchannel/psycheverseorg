const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'psycheverse-admin-secret-key';

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Create uploads directory
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// Database initialization
const db = new sqlite3.Database('./psycheverse.db');

// Initialize database tables
db.serialize(() => {
    // Admin users table
    db.run(`CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    )`);

    // Creators table
    db.run(`CREATE TABLE IF NOT EXISTS creators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_name TEXT NOT NULL,
        description TEXT,
        avatar_url TEXT,
        status TEXT DEFAULT 'offline',
        is_featured BOOLEAN DEFAULT 0,
        is_paid_member BOOLEAN DEFAULT 0,
        featured_priority INTEGER DEFAULT 0,
        platforms TEXT, -- JSON string
        viewers INTEGER DEFAULT 0,
        last_live_start DATETIME,
        last_seen DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Subscriptions table
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creator_id INTEGER,
        stripe_subscription_id TEXT UNIQUE,
        stripe_customer_id TEXT,
        status TEXT,
        plan_type TEXT,
        amount INTEGER,
        currency TEXT DEFAULT 'usd',
        current_period_start DATETIME,
        current_period_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES creators (id)
    )`);

    // Analytics table
    db.run(`CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        event_data TEXT, -- JSON string
        creator_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES creators (id)
    )`);

    // Site settings table
    db.run(`CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create default admin user (password: admin123)
    const defaultPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO admin_users (username, email, password_hash, role) 
            VALUES ('admin', 'admin@psycheverse.org', ?, 'super_admin')`, [defaultPassword]);

    // Insert default site settings
    const defaultSettings = [
        ['site_title', 'Psycheverse Admin'],
        ['featured_slots', '4'],
        ['subscription_price', '1999'], // $19.99 in cents
        ['auto_approve_free', 'false'],
        ['max_free_listings', '50']
    ];

    defaultSettings.forEach(([key, value]) => {
        db.run(`INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)`, [key, value]);
    });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Admin role middleware
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// AUTH ROUTES

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM admin_users WHERE username = ? OR email = ?', [username, username], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        db.run('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    });
});

// Verify token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// CREATOR MANAGEMENT ROUTES

// Get all creators
app.get('/api/creators', authenticateToken, (req, res) => {
    const { status, featured, search, limit = 50, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM creators WHERE 1=1';
    let params = [];

    if (status) {
        query += ' AND status = ?';
        params.push(status);
    }

    if (featured !== undefined) {
        query += ' AND is_featured = ?';
        params.push(featured === 'true' ? 1 : 0);
    }

    if (search) {
        query += ' AND (display_name LIKE ? OR description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY is_featured DESC, featured_priority DESC, last_seen DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    db.all(query, params, (err, creators) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        // Parse platforms JSON
        creators.forEach(creator => {
            if (creator.platforms) {
                try {
                    creator.platforms = JSON.parse(creator.platforms);
                } catch (e) {
                    creator.platforms = [];
                }
            } else {
                creator.platforms = [];
            }
        });

        res.json(creators);
    });
});

// Get creator by ID
app.get('/api/creators/:id', authenticateToken, (req, res) => {
    db.get('SELECT * FROM creators WHERE id = ?', [req.params.id], (err, creator) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        if (creator.platforms) {
            try {
                creator.platforms = JSON.parse(creator.platforms);
            } catch (e) {
                creator.platforms = [];
            }
        }

        res.json(creator);
    });
});

// Create creator
app.post('/api/creators', authenticateToken, requireAdmin, upload.single('avatar'), (req, res) => {
    const {
        display_name,
        description,
        platforms,
        is_featured = false,
        is_paid_member = false,
        featured_priority = 0
    } = req.body;

    const avatar_url = req.file ? `/uploads/${req.file.filename}` : null;
    const platformsJson = typeof platforms === 'string' ? platforms : JSON.stringify(platforms || []);

    db.run(`INSERT INTO creators (
        display_name, description, avatar_url, platforms, 
        is_featured, is_paid_member, featured_priority
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
    [display_name, description, avatar_url, platformsJson, is_featured, is_paid_member, featured_priority],
    function(err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({ id: this.lastID, message: 'Creator created successfully' });
    });
});

// Update creator
app.put('/api/creators/:id', authenticateToken, requireAdmin, upload.single('avatar'), (req, res) => {
    const {
        display_name,
        description,
        platforms,
        status,
        is_featured,
        is_paid_member,
        featured_priority,
        viewers
    } = req.body;

    let updateFields = [];
    let params = [];

    if (display_name !== undefined) {
        updateFields.push('display_name = ?');
        params.push(display_name);
    }

    if (description !== undefined) {
        updateFields.push('description = ?');
        params.push(description);
    }

    if (req.file) {
        updateFields.push('avatar_url = ?');
        params.push(`/uploads/${req.file.filename}`);
    }

    if (platforms !== undefined) {
        updateFields.push('platforms = ?');
        params.push(typeof platforms === 'string' ? platforms : JSON.stringify(platforms));
    }

    if (status !== undefined) {
        updateFields.push('status = ?');
        params.push(status);
    }

    if (is_featured !== undefined) {
        updateFields.push('is_featured = ?');
        params.push(is_featured);
    }

    if (is_paid_member !== undefined) {
        updateFields.push('is_paid_member = ?');
        params.push(is_paid_member);
    }

    if (featured_priority !== undefined) {
        updateFields.push('featured_priority = ?');
        params.push(featured_priority);
    }

    if (viewers !== undefined) {
        updateFields.push('viewers = ?');
        params.push(viewers);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    const query = `UPDATE creators SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(query, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        res.json({ message: 'Creator updated successfully' });
    });
});

// Delete creator
app.delete('/api/creators/:id', authenticateToken, requireAdmin, (req, res) => {
    db.run('DELETE FROM creators WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        res.json({ message: 'Creator deleted successfully' });
    });
});

// LIVE STATUS MANAGEMENT

// Update live status
app.post('/api/creators/:id/status', authenticateToken, requireAdmin, (req, res) => {
    const { status, viewers, live_start } = req.body;
    
    let updateFields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    let params = [status];

    if (viewers !== undefined) {
        updateFields.push('viewers = ?');
        params.push(viewers);
    }

    if (status === 'live' && live_start) {
        updateFields.push('last_live_start = ?');
        params.push(live_start);
    }

    if (status !== 'offline') {
        updateFields.push('last_seen = CURRENT_TIMESTAMP');
    }

    params.push(req.params.id);

    const query = `UPDATE creators SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(query, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        // Log analytics event
        db.run(`INSERT INTO analytics (event_type, event_data, creator_id) 
                VALUES ('status_change', ?, ?)`, 
                [JSON.stringify({ status, viewers }), req.params.id]);

        res.json({ message: 'Status updated successfully' });
    });
});

// Bulk update live status (for API polling)
app.post('/api/creators/bulk-status', authenticateToken, (req, res) => {
    const { updates } = req.body; // Array of {id, status, viewers}

    if (!Array.isArray(updates)) {
        return res.status(400).json({ error: 'Updates must be an array' });
    }

    const stmt = db.prepare(`UPDATE creators SET status = ?, viewers = ?, 
                            last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
                            WHERE id = ?`);

    updates.forEach(update => {
        stmt.run([update.status, update.viewers || 0, update.id]);
    });

    stmt.finalize();

    res.json({ message: `Updated ${updates.length} creators` });
});

// SUBSCRIPTION MANAGEMENT

// Get all subscriptions
app.get('/api/subscriptions', authenticateToken, requireAdmin, (req, res) => {
    const query = `
        SELECT s.*, c.display_name, c.email 
        FROM subscriptions s 
        LEFT JOIN creators c ON s.creator_id = c.id 
        ORDER BY s.created_at DESC
    `;

    db.all(query, [], (err, subscriptions) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(subscriptions);
    });
});

// ANALYTICS ROUTES

// Get dashboard stats
app.get('/api/analytics/dashboard', authenticateToken, (req, res) => {
    const stats = {};

    // Get creator counts
    db.get(`SELECT 
        COUNT(*) as total_creators,
        SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as live_creators,
        SUM(CASE WHEN is_featured = 1 THEN 1 ELSE 0 END) as featured_creators,
        SUM(CASE WHEN is_paid_member = 1 THEN 1 ELSE 0 END) as paid_members,
        SUM(viewers) as total_viewers
        FROM creators`, [], (err, creatorStats) => {
        
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        stats.creators = creatorStats;

        // Get subscription stats
        db.get(`SELECT 
            COUNT(*) as total_subscriptions,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_subscriptions,
            SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END) as monthly_revenue
            FROM subscriptions`, [], (err, subStats) => {
            
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            stats.subscriptions = subStats;

            // Get recent activity
            db.all(`SELECT event_type, COUNT(*) as count 
                    FROM analytics 
                    WHERE timestamp > datetime('now', '-7 days') 
                    GROUP BY event_type`, [], (err, activity) => {
                
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }

                stats.recent_activity = activity;
                res.json(stats);
            });
        });
    });
});

// SITE SETTINGS

// Get settings
app.get('/api/settings', authenticateToken, requireAdmin, (req, res) => {
    db.all('SELECT * FROM site_settings', [], (err, settings) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        const settingsObj = {};
        settings.forEach(setting => {
            settingsObj[setting.key] = setting.value;
        });

        res.json(settingsObj);
    });
});

// Update settings
app.put('/api/settings', authenticateToken, requireAdmin, (req, res) => {
    const settings = req.body;

    const stmt = db.prepare(`INSERT OR REPLACE INTO site_settings (key, value, updated_at) 
                            VALUES (?, ?, CURRENT_TIMESTAMP)`);

    Object.entries(settings).forEach(([key, value]) => {
        stmt.run([key, value]);
    });

    stmt.finalize();

    res.json({ message: 'Settings updated successfully' });
});

// EXPORT DATA

// Export creators as JSON
app.get('/api/export/creators', authenticateToken, requireAdmin, (req, res) => {
    db.all('SELECT * FROM creators ORDER BY is_featured DESC, display_name ASC', [], (err, creators) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        // Parse platforms JSON for each creator
        creators.forEach(creator => {
            if (creator.platforms) {
                try {
                    creator.platforms = JSON.parse(creator.platforms);
                } catch (e) {
                    creator.platforms = [];
                }
            }
        });

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=psycheverse-creators.json');
        res.json(creators);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Psycheverse Admin API running on port ${PORT}`);
    console.log(`📊 Admin Dashboard: http://localhost:${PORT}`);
    console.log(`🔑 Default login: admin / admin123`);
});

module.exports = app;
