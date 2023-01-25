const { Contract } = require('./model');
const { Op } = require('sequelize');

const getQueryByProfileType = ({ type, id }) => (type === 'contractor' ? { ContractorId: id } : { ClientId: id });

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
    const query = {
        where: {
            ...getQueryByProfileType(profile),
            ...getQueryByState(state),
        },
    };

    return Contract.findAll(query);
};

module.exports = { getContractsByState, getQueryByProfileType, getQueryByState };
