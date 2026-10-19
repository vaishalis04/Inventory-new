const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const sequelize = require('./src/config/db');
const { errorHandler } = require('./src/middleware/error.middleware');

// Routes
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const warehouseRoutes = require('./src/routes/warehouse.routes');
const categoryRoutes = require('./src/routes/category.routes');
const supplierRoutes = require('./src/routes/supplier.routes');
const printerRoutes = require('./src/routes/printer.routes');
const itemRoutes = require('./src/routes/item.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');
const boxRoutes = require('./src/routes/box.routes');
const scanRoutes = require('./src/routes/scan.routes');
const printRoutes = require('./src/routes/print.routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/printers', printerRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/boxes', boxRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/print', printRoutes);

// ✅ Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ✅ 404 + Error handler
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorHandler);

// ✅ Start server (skipped when required by the smoke test)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  (async () => {
    try {
      await sequelize.authenticate();
      await sequelize.sync({ alter: process.env.DB_SYNC === 'alter' });
      app.listen(PORT, () => console.log(`🚀 Inventory API running on port ${PORT}`));
    } catch (err) {
      console.error('❌ Failed to start server:', err);
      process.exit(1);
    }
  })();
}

module.exports = app;
