const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./model');
const app = express();
const contractsRouter = require('./routes/contracts');
const jobsRouter = require('./routes/jobs');
const balancesRouter = require('./routes/balances');
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);

app.use(contractsRouter);
app.use(jobsRouter);
app.use(balancesRouter);

module.exports = app;
