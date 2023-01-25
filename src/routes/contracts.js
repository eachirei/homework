const { getContractsByState,
    getQueryByProfileType
} = require('../utils');
const { getProfile } = require('../middleware/getProfile');
const express = require('express');
const router = express.Router();


router.use(getProfile);

router.get('/contracts', async (req, res, next) => {
    const contracts = await getContractsByState(req.profile, 'unfinished');

    return res.json(contracts);
});

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

module.exports = router;
