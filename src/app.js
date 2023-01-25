const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./model');
const { getProfile } = require('./middleware/getProfile');
const { Op } = require('sequelize');
const router = express.Router();
const app = express();
const contractsRouter = require('./routes/contracts');
const { getQueryByProfileType,
    getQueryByState
} = require('./utils');
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);

app.use(contractsRouter);

router.use(getProfile);

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
                throw new Error('404');
            }

            const contractorProfile = job.Contract.Contractor;

            const clientProfile = req.profile;

            if (job.price > clientProfile.balance) {
                throw new Error('403');
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

const canUserDeposit = async (profile, toDeposit, transaction) => {
    const query = {
        where: {
            ...getQueryByProfileType(profile),
            ...getQueryByState('active'),
            '$Jobs.paid$': { [Op.or]: [null, false] },
        },
    };

    const { Job } = app.get('models');

    const { Contract } = app.get('models');

    const dbResult = await Contract.findAll(
        {
            ...query,
            include: [
                {
                    model: Job,
                    attributes: [],
                },
            ],
            attributes: [[sequelize.fn('SUM', sequelize.literal('Jobs.price')), 'jobsPrice']],
        },
        { transaction }
    );

    const remainingToPay = dbResult.length ? +dbResult[0].getDataValue('jobsPrice') : 0;

    const maxToDeposit = remainingToPay > 0 ? 0.25 * remainingToPay : Number.POSITIVE_INFINITY;

    return toDeposit < maxToDeposit;
};

router.post('/balances/deposit/:user_id', async (req, res, next) => {
    const { Profile } = req.app.get('models');

    const toDeposit = req.body.deposit;
    const sourceProfile = req.profile;
    const destinationProfileId = parseInt(req.params.user_id);

    if (sourceProfile.id === destinationProfileId) {
        return res.status(400).end();
    }

    try {
        await sequelize.transaction(async t => {
            const destinationProfile = await Profile.findOne({ id: destinationProfileId });
            if (!destinationProfile) {
                throw new Error('404');
            }

            if (sourceProfile.balance < toDeposit) {
                throw new Error('403');
            }
            if (sourceProfile.type === 'client') {
                // query included here to make sure no db changes happen between the job query and the deposit
                const canDeposit = await canUserDeposit(sourceProfile, toDeposit, t);
                if (!canDeposit) {
                    throw new Error('403');
                }
            }

            await sourceProfile.update({ balance: sourceProfile.balance - toDeposit }, { transaction: t });
            await destinationProfile.update({ balance: sourceProfile.balance + toDeposit }, { transaction: t });
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
