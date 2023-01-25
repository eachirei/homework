const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./model');
const { getProfile } = require('./middleware/getProfile');
const { Op } = require('sequelize');
const router = express.Router();
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);

router.use(getProfile);

const getQueryByProfileType = ({ type, id }) => (type === 'contractor' ? { ContractorId: id } : { ClientId: id });

/**
 * @returns contract by id
 */
router.get('/contracts/:id', async (req, res) => {
    const { Contract } = req.app.get('models');
    const { id } = req.params;

    const query = {
        where: {
            ...getQueryByProfileType(req.profile),
            id,
        },
    };

    const contract = await Contract.findOne(query);
    if (!contract) {
        return res.status(404).end();
    }

    return res.json(contract);
});

router.get('/contracts', async (req, res, next) => {
    const { Contract } = req.app.get('models');

    // query by contractor id or client id based on type of profile
    const query = {
        where: {
            ...getQueryByProfileType(req.profile),
            [Op.not]: { status: 'terminated' },
        },
    };

    const contracts = await Contract.findAll(query);
    if (!contracts) {
        return res.status(404).end();
    }

    return res.json(contracts);
});

app.use(router);

module.exports = app;
