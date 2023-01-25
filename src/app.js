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
            '$Jobs.paid$': { [Op.or]: [null, false] },
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

router.post('/jobs/:job_id/pay', async (req, res, next) => {
    const { Job, Contract, Profile } = req.app.get('models');

    const { job_id } = req.params;

    try {
        await sequelize.transaction(async t => {
            // find the job in the transaction to ensure that between finding the job and actual payment the job isn't paid twice
            const job = await Job.findOne(
                {
                    where: {
                        id: job_id,
                        paid: { [Op.or]: [null, false] },
                        '$Contract.ClientId$': req.profile.id,
                    },
                    include: [{ model: Contract, include: [{ model: Profile, as: 'Contractor' }] }],
                },
                { transaction: t }
            );

            if (!job) {
                throw new Error({ message: '404' });
            }

            const contractorProfile = job.Contract.Contractor;

            const clientProfile = req.profile;

            if (job.price > clientProfile.balance) {
                throw new Error({ message: '403' });
            }

            await clientProfile.update({ balance: clientProfile.balance - job.price }, { transaction: t });
            await contractorProfile.update({ balance: clientProfile.balance + job.price }, { transaction: t });
            await job.update({ paid: true, paymentDate: new Date() }, { transaction: t });
        });
    } catch (error) {
        const possibleErrorCode = parseInt(error.message, 10);
        if (!Number.isNaN(possibleErrorCode)) {
            return res.status(possibleErrorCode).end();
        }
        return res.status(500).end();
    }

    return res.status(200).end();
});

app.use(router);

module.exports = app;
