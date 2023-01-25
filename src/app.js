const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./model');
const { getProfile } = require('./middleware/getProfile');
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);

/**
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models');
    const { id } = req.params;
    const {type, id: profileId} = req.profile;

    // query by contractor id or client id based on type of profile
    const query = {
        where: {
            id,
            ...(type === 'contractor' ? {'ContractorId': profileId} : {'ClientId': profileId})
        },
    };

    const contract = await Contract.findOne(query);
    if (!contract) {
        return res.status(404).end();
    }

    return res.json(contract);
});
module.exports = app;
