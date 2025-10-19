# Psycheverse Admin System - Complete Deployment Guide

## 🚀 Most Powerful Admin System

This is the **most powerful and efficient** admin system for your Psycheverse platform. It includes:

- **Full Database Management** with SQLite
- **User Authentication** with JWT tokens
- **Creator Management** with live status tracking
- **Payment Integration** with Stripe webhooks
- **Analytics Dashboard** with real-time stats
- **File Upload System** for creator avatars
- **API Integration** for YouTube/Twitch live status
- **Role-based Access Control** for multiple admin users

## 📁 System Architecture

```
psycheverse-admin/
├── backend/
│   ├── server.js           # Main API server
│   ├── package.json        # Dependencies
│   └── uploads/            # File uploads directory
├── frontend/
│   └── index.html          # Admin dashboard interface
├── database/
│   └── psycheverse.db      # SQLite database (auto-created)
├── .env.example            # Environment variables template
└── ADMIN_DEPLOYMENT_GUIDE.md
```

## 🔧 Installation & Setup

### Option 1: Local Development Server

1. **Install Node.js** (v16 or higher)
2. **Navigate to backend directory**:
   ```bash
   cd psycheverse-admin/backend
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Create environment file**:
   ```bash
   cp ../.env.example .env
   ```

5. **Edit .env file** with your actual API keys and settings

6. **Start the server**:
   ```bash
   npm start
   ```

7. **Access admin dashboard**: http://localhost:3001

### Option 2: Production Deployment (VPS/Cloud)

1. **Upload files** to your server
2. **Install Node.js and PM2**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```

3. **Install dependencies**:
   ```bash
   cd psycheverse-admin/backend
   npm install --production
   ```

4. **Configure environment**:
   ```bash
   cp ../.env.example .env
   nano .env  # Edit with your settings
   ```

5. **Start with PM2**:
   ```bash
   pm2 start server.js --name "psycheverse-admin"
   pm2 startup
   pm2 save
   ```

6. **Configure reverse proxy** (Nginx example):
   ```nginx
   server {
       listen 80;
       server_name admin.psycheverse.org;
       
       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Option 3: Netlify Functions (Serverless)

1. **Create netlify.toml**:
   ```toml
   [build]
     functions = "backend"
     publish = "frontend"
   
   [functions]
     node_bundler = "esbuild"
   
   [[redirects]]
     from = "/api/*"
     to = "/.netlify/functions/:splat"
     status = 200
   ```

2. **Convert server.js to Netlify functions**
3. **Deploy to Netlify** with environment variables

## 🔑 Default Login Credentials

- **Username**: `admin`
- **Password**: `admin123`
- **Email**: `admin@psycheverse.org`

**⚠️ IMPORTANT**: Change these credentials immediately after first login!

## 🎯 Admin Features

### 📊 Dashboard Overview
- **Real-time statistics** (creators, live streams, revenue)
- **Recent activity** tracking
- **Performance metrics** and growth charts
- **Quick action buttons** for common tasks

### 👥 Creator Management
- **Add/Edit/Delete** creators with full profile management
- **Avatar upload** with automatic resizing
- **Platform integration** (YouTube, Twitch, Rumble, Kick)
- **Live status tracking** with automatic updates
- **Featured placement** management with priority ordering
- **Bulk operations** for efficient management

### 👑 Featured Creator Control
- **4 featured slots** with drag-and-drop reordering
- **Priority system** for featured placement
- **Automatic featured badge** display on public site
- **Revenue tracking** for featured placements

### 💳 Subscription Management
- **Stripe integration** with webhook processing
- **Subscription lifecycle** management
- **Revenue analytics** and reporting
- **Customer management** with payment history
- **Refund processing** and dispute handling

### 📈 Analytics & Reporting
- **Real-time dashboard** with key metrics
- **Creator performance** tracking
- **Revenue analytics** with growth trends
- **User engagement** statistics
- **Export capabilities** for external analysis

### ⚙️ Site Settings
- **Global configuration** management
- **Featured slots** quantity control
- **Pricing management** for subscriptions
- **Auto-approval** settings for free listings
- **Platform limits** and quotas

## 🔌 API Integration

### Live Status Polling
The system automatically polls YouTube and Twitch APIs every 3 minutes to update creator live status:

```javascript
// Automatic status updates
setInterval(async () => {
    await updateCreatorLiveStatus();
}, 180000); // 3 minutes
```

### Stripe Webhooks
Handles all subscription events automatically:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

### Data Export
Export creator data for your public website:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3001/api/export/creators > creators.json
```

## 🔒 Security Features

### Authentication
- **JWT token-based** authentication
- **Bcrypt password** hashing
- **Role-based access** control (admin, super_admin)
- **Session management** with automatic expiry

### Data Protection
- **SQL injection** prevention with parameterized queries
- **File upload** validation and sanitization
- **CORS protection** with configurable origins
- **Rate limiting** on sensitive endpoints

### API Security
- **Webhook signature** verification for Stripe
- **Environment variable** protection for secrets
- **Input validation** on all endpoints
- **Error handling** without information leakage

## 📊 Database Schema

### Tables Created Automatically
- `admin_users` - Admin user accounts
- `creators` - Creator profiles and status
- `subscriptions` - Stripe subscription data
- `analytics` - Event tracking and metrics
- `site_settings` - Global configuration

### Backup & Recovery
```bash
# Backup database
cp psycheverse.db psycheverse-backup-$(date +%Y%m%d).db

# Restore database
cp psycheverse-backup-20241015.db psycheverse.db
```

## 🚀 Performance Optimizations

### Database
- **Indexed queries** for fast searches
- **Connection pooling** for concurrent requests
- **Prepared statements** for repeated queries
- **Automatic cleanup** of old analytics data

### File Handling
- **Multer middleware** for efficient uploads
- **File size limits** to prevent abuse
- **Image optimization** for avatars
- **CDN-ready** file serving

### API Efficiency
- **Pagination** for large datasets
- **Caching** for frequently accessed data
- **Bulk operations** for mass updates
- **Async processing** for heavy operations

## 🔄 Maintenance

### Regular Tasks
- **Database backup** (daily recommended)
- **Log rotation** for server logs
- **API key rotation** for security
- **Performance monitoring** and optimization

### Monitoring
- **Health check** endpoint: `/api/health`
- **Database status** monitoring
- **API response times** tracking
- **Error rate** monitoring

## 📞 Support & Troubleshooting

### Common Issues
1. **Database locked**: Restart server, check file permissions
2. **API rate limits**: Implement exponential backoff
3. **File upload fails**: Check disk space and permissions
4. **Stripe webhooks fail**: Verify endpoint URL and secret

### Debug Mode
Set `NODE_ENV=development` for detailed error messages and logging.

### Logs Location
- **Application logs**: Console output or PM2 logs
- **Database logs**: SQLite doesn't log by default
- **Nginx logs**: `/var/log/nginx/` (if using reverse proxy)

## 🎉 You're Ready!

This admin system gives you **complete control** over your Psycheverse platform:

✅ **Manage thousands of creators** efficiently
✅ **Process payments** automatically with Stripe
✅ **Track performance** with real-time analytics
✅ **Scale your business** with professional tools
✅ **Maintain security** with enterprise-grade features

**Login with admin/admin123 and start managing your streaming empire!** 🌌👑
