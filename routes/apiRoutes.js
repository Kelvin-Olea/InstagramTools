const express = require('express');
const router = express.Router();
const InstagramService = require('../services/instagramService');

function getErrorMessage(error) {
    const msg = error.message || '';

    return msg || 'An unexpected error occurred.';
}

router.post('/api/filter-lists', async (req, res) => {
    try {
        const { filterUsernames } = req.body;
        const { booleanOperator } = req.body;

        if (!filterUsernames || !Array.isArray(filterUsernames) || filterUsernames.length < 2) {
            return res.status(400).json({ error: 'Please provide at least 2 usernames' });
        }

        const invalid = filterUsernames.filter(u => !u[0] || typeof u[0] !== 'string' || u[0].trim().length === 0);
        if (invalid.length > 0) {
            return res.status(400).json({ error: 'All usernames must be non-empty strings' });
        }

        const usernames = filterUsernames
        const usersList = await InstagramService.getFilteredList(filterUsernames, booleanOperator);

        res.json({
            success: true,
            usernames,
            usersList,
            count: usersList.length,
        });
    } catch (error) {
        console.error('Error fetching mutual followers:', error);
        res.status(500).json({ error: getErrorMessage(error) });
    }
});

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

router.post('/api/friends/estimate', async (req, res) => {
    const username = req.body.username?.[0];
    if (typeof username !== 'string' || !username.trim()) {
        return res.status(400).json({ error: 'Invalid username' });
    }
    
    const estimate = await InstagramService.estimateFriendsTime(username);

    res.json({ success: true, estimatedSeconds: estimate });
});

const fetch = require('node-fetch');

router.get('/pfp', async (req, res) => {
    try {
        const url = new URL(req.query.url);

        const oe = url.searchParams.get('oe');
        if (oe && parseInt(oe, 16) * 1000 < Date.now()) return res.status(410).send('Expired Image PFP');

        // https only, and only Instagram CDN hosts, otherwise this becomes an open proxy
        if (url.protocol !== 'https:' || !/(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/.test(url.hostname)) {
            return res.status(400).send('Invalid host');
        }

        const upstream = await fetch(url.href, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36' },
        });
        
        if (!upstream.ok) return res.status(upstream.status).end();

        const type = upstream.headers.get('content-type') || 'image/jpeg';
        if (!type.startsWith('image/')) return res.status(400).send('Not an image');

        res.set('Content-Type', type);
        res.set('Cache-Control', 'public, max-age=43200'); // 43200 = 12 hrs
        upstream.body.on('error', () => res.end());
        upstream.body.pipe(res);
    } catch (err) {
        res.status(400).send('Bad request');
    }
});

router.get('/api/map', async (req, res) => {
  try {
    const { nodes, links } = await InstagramService.getMap();

    res.json({
      success: true,
      nodes,
      links,
      count: nodes.length,
    });
  } catch (error) {
    console.error('Error generating map:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

module.exports = router;