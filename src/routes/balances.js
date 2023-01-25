const { sequelize } = require('../model');
const { getQueryByProfileType, getQueryByState } = require('../utils');
const express = require('express');
const { getProfile } = require('../middleware/getProfile');
const router = express.Router();
const { Job, Contract } = require('../model');
const { Op } = require('sequelize');

router.use(getProfile);

const canUserDeposit = async (profile, toDeposit, transaction) => {
    const query = {
        where: {
            ...getQueryByProfileType(profile),
            ...getQueryByState('active'),
            '$Jobs.paid$': { [Op.or]: [null, false] },
        },
    };

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

module.exports = router;
