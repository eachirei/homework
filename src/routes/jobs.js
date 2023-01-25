const { getQueryByProfileType, getQueryByState } = require('../utils');
const { sequelize } = require('../model');
const express = require('express');
const { getProfile } = require('../middleware/getProfile');
const router = express.Router();
const { Op } = require('sequelize');

router.use(getProfile);
router.get('/jobs/unpaid', async (req, res, next) => {
    const { Job } = req.app.get('models');

    const { Contract } = req.app.get('models');

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

module.exports = router;
