const express = require('express');
const router = express.Router();
const InstagramService = require('../services/instagramService');

function getErrorMessage(error) {
    const msg = error.message || '';

    return msg || 'An unexpected error occurred.';
}

// router.post('/api/mutual-followers', async (req, res) => {
//     try {
//         const { usernames } = req.body;

//         if (!usernames || !Array.isArray(usernames) || usernames.length < 2) {
//             return res.status(400).json({ error: 'Please provide at least 2 usernames' });
//         }

//         const invalid = usernames.filter(u => !u || typeof u !== 'string' || u.trim().length === 0);
//         if (invalid.length > 0) {
//             return res.status(400).json({ error: 'All usernames must be non-empty strings' });
//         }

//         const mutualFollowers = await InstagramService.getMutualFollowers(usernames);

//         res.json({
//             success: true,
//             usernames,
//             mutualFollowers,
//             count: mutualFollowers.length,
//         });
//     } catch (error) {
//         console.error('Error fetching mutual followers:', error);
//         res.status(500).json({ error: getErrorMessage(error) });
//     }
// });

router.post('/api/friends', async (req, res) => {
    try {
        const usernames = req.body.username?.[0]; // Pull the username out the requests body

        if (typeof usernames !== 'string' || usernames.trim().length === 0) { // Filter out any invalid users (empty, not string, etc.)                                                         
            return res.status(400).json({ error: 'All usernames must be non-empty strings' });
        }

        const usersList = await InstagramService.getFriends(usernames);

        res.json({
            success: true,
            usernames,
            usersList,
            count: usersList.length,
        });
    } catch (error) {
        console.error('Error fetching friends:', error);
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

module.exports = router;