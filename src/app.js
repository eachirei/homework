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

/**
 *
 * @param state {'active' | 'unfinished'}
 * @returns queryByState
 */
const getQueryByState = state => {
    switch (state) {
        case 'active': {
            return {
                status: 'in_progress',
            };
        }
        case 'unfinished': {
            return {
                [Op.not]: { status: 'terminated' },
            };
        }
    }
};

/***
 * @param profile Profile
 * @param state {'active' | 'unfinished'}
 * @returns Promise<Array<Contract>>
 */
const getContractsByState = (profile, state) => {
    const { Contract } = app.get('models');

    const query = {
        where: {
            ...getQueryByProfileType(profile),
            ...getQueryByState(state),
        },
    };

    return Contract.findAll(query);
};

router.get('/contracts', async (req, res, next) => {
    const contracts = await getContractsByState(req.profile, 'unfinished');

    return res.json(contracts);
});

router.get('/jobs/unpaid', async (req, res, next) => {
    const { Job } = req.app.get('models');

    const { Contract } = app.get('models');

    const query = {
        where: {
            ...getQueryByProfileType(req.profile),
            ...getQueryByState('active'),
            '$Jobs.paid$': {[Op.or]: [null, false]}
        },
    };

    const contractsWithJobs = await Contract.findAll({
        ...query,
        include: [
            {
                model: Job,
            },
        ],
    });

    return res.json(contractsWithJobs.map(c => c.Jobs).flat());
});

app.use(router);

module.exports = app;
