// CONSTANTS //
const MIN_SCAN_DELAY = 6000; // ms
const MAX_SCAN_DELAY = 10000; // ms

const USERS_PER_SCAN = 25;

const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();

class InstagramService {
    constructor() {
        this.baseUrl = 'https://www.instagram.com';
        this.cacheFile = 'cache.json';
        this.cache = new Map();
        this.loadCache();

        if (!process.env.INSTAGRAM_SESSION_ID) {
            console.warn('WARNING: INSTAGRAM_SESSION_ID is not set in .env');
        } else if (!process.env.CSRF_TOKEN) {
            console.warn('WARNING: CSRF_TOKEN is not set in .env');
        } else if (!process.env.DS_USER_ID) {
            console.warn('WARNING: DS_USER_ID is not set in .env');
        } else if (!process.env.X_ASBD_ID) {
            console.warn('WARNING: X_ASBD_ID is not set in .env');
        }

        this.baseHeaders = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',

            'Sec-Ch-Ua-Platform': '"Linux"',
            'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="146"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',

            'Cookie': `sessionid=${process.env.INSTAGRAM_SESSION_ID}; csrftoken=${process.env.CSRF_TOKEN}; ds_user_id=${process.env.DS_USER_ID}`,
            'X-Csrftoken': `${process.env.CSRF_TOKEN}`,
        };

        if (process.env.X_ASBD_ID) this.baseHeaders['X-ASBD-ID'] = process.env.X_ASBD_ID;
    }

    // Get who user is friends with //
    async getFriends(username) {
        const cacheKey = `friends_${username}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        await this.delay(this.randomBetween(MIN_SCAN_DELAY, MAX_SCAN_DELAY))

        const userId = await this.fetchUserId(username);

        if (!userId) throw new Error(`Could not find user: ${username}`);

        // Add a way to ensure the user is either public, or someone we're following //

        const followers = await this.fetchFollowersList(userId, username);
        await this.delay(this.randomBetween(MIN_SCAN_DELAY, MAX_SCAN_DELAY))
        const following = await this.fetchFollowingList(userId, username);

        const friends = await this.findIntersection([followers, following]);

        this.cache.set(cacheKey, friends);
        this.saveCache();

        return friends;
    }

    async estimateFriendsTime(username) {
        const cacheKey = `friends_${username}`;
        if (this.cache.has(cacheKey)) {
            return 0;
        }

        const totalCount = await this.fetchTotalCount(username);

        if (!totalCount) throw new Error(`Could not get estimate: ${username}`);

        return ((totalCount/USERS_PER_SCAN)*MAX_SCAN_DELAY)+MAX_SCAN_DELAY;
    }

    async getFilteredList(filteredUsernames, booleanOperator) {

        let cachedLists = []

        for (const params of filteredUsernames) {
            if (this.cache.has(`${params[1]}_${params[0]}`)) {
                cachedLists.push(this.cache.get(`${params[1]}_${params[0]}`))
            } else {
                throw Error(`User ${params[0]} does not exist in the cache. Run them through the friend finder first.`)
            }
        }

        const filteredList = await this.findIntersection([cachedLists[0], cachedLists[1]], booleanOperator);

        return filteredList;
    }

    getMap() {
        const PREFIX = 'friends_';
        const MIN_LINKS = 2;
        const nodes = new Map();
        let links = [];
        const seen = new Set();

        const addNode = (username, scanned = false, pic = '') => {
            const existing = nodes.get(username);
            if (existing) {
                if (scanned) existing.scanned = true;
                if (pic && !existing.pic) existing.pic = pic;
                return;
            }
            nodes.set(username, { id: username, scanned, pic, totalLinks: 0 });
        };

        for (const [key, friends] of this.cache) {
            if (!key.startsWith(PREFIX)) continue;

            const owner = key.slice(PREFIX.length);
            addNode(owner, true);

            for (const friend of friends) {
                if (friend.username === owner) continue;
                addNode(friend.username, false, friend.profile_pic_url);

                const linkKey = [owner, friend.username].sort().join('|');
                if (seen.has(linkKey)) continue;
                seen.add(linkKey);

                links.push({ source: owner, target: friend.username });
                nodes.get(owner).totalLinks += 1;
                nodes.get(friend.username).totalLinks += 1;
            }
        }

        // Lookup of who is linked to whom
        const adj = new Map();   // id -> Set of neighbor ids
        for (const l of links) {
            if (!adj.has(l.source)) adj.set(l.source, new Set());
            if (!adj.has(l.target)) adj.set(l.target, new Set());
            adj.get(l.source).add(l.target);
            adj.get(l.target).add(l.source);
        }

        // Identifies a link regardless of which end is source/target
        const edgeKey = (x, y) => [x, y].sort().join('|');

        const scannedIds = [...nodes.values()].filter(n => n.scanned).map(n => n.id);
        const cut = new Set();   // links to remove
        const protect = new Set();

        for (let i = 0; i < scannedIds.length; i++) {
            for (let j = i + 1; j < scannedIds.length; j++) {
                const a = scannedIds[i];
                const b = scannedIds[j];

                if (!adj.get(a)?.has(b)) { // a and b aren't directly linked
                for (const n of adj.get(a)) {
                    if (n === b || nodes.get(n).scanned) continue;
                    if (adj.get(b).has(n)) {
                        // n only needs to be cut off from a and b, not deleted
                        protect.add(edgeKey(n, a));
                        protect.add(edgeKey(n, b));
                    }
                }
                };

                for (const n of adj.get(a)) {
                    if (n === b || nodes.get(n).scanned) continue;
                    if (adj.get(b).has(n)) {
                        // n only needs to be cut off from a and b, not deleted
                        cut.add(edgeKey(n, a));
                        cut.add(edgeKey(n, b));
                    }
                }
            }
        }

        // Drop the cut links, then recount so sizes and the MIN_LINKS filter use the new numbers
        links = links.filter(l => !cut.has(edgeKey(l.source, l.target)) || protect.has(edgeKey(l.source, l.target)));

        nodes.forEach(n => { n.totalLinks = 0; });
        for (const l of links) {
            nodes.get(l.source).totalLinks += 1;
            nodes.get(l.target).totalLinks += 1;
        }

        // Remove non-scanned users with fewer than MIN_LINKS connections
        const keptNodes = [...nodes.values()].filter(
            n => n.scanned || n.totalLinks >= MIN_LINKS
        );
        const keptIds = new Set(keptNodes.map(n => n.id));
        const keptLinks = links.filter(
            l => keptIds.has(l.source) && keptIds.has(l.target)
        );

        return { nodes: keptNodes, links: keptLinks };
    }

    async fetchUserId(username) {
        try {
            const cacheKey = `userid_${username}`
            if (this.cache.has(cacheKey)){
                return this.cache.get(cacheKey);
            }

            const url = `${this.baseUrl}/${username}/`;
            const response = await fetch(url, { headers: this.getUserIDHeaders()});
                    
            if (response.status === 404) return null;
            if (response.status === 429) throw new Error('Rate limited (429). Wait a few minutes before retrying.');
            if (response.status === 401) throw new Error('Invalid or expired Session ID. Please update INSTAGRAM_SESSION_ID in .env');
            if (!response.ok) throw new Error(`Instagram returned status ${response.status}`);

            // Check if the URL we're redirected to is the login page, authentication page, or directly challenged
            if (/accounts\/login|auth_platform|challenge/.test(response.url)) {
                throw new Error('Session invalid or challenged. Update cookies in .env');
            }
            const html = await response.text();
            // const html = fs.readFileSync("output.txt", "utf8")
            // fs.writeFileSync("output.txt", html)        

            const userId = await this.parseHtmlForUserId(html);
            if (!userId) {throw new Error("Unable to find UserId")};
            await this.delay(MIN_SCAN_DELAY); // Force wait 8 seconds after sending any html request

            this.cache.set(cacheKey, userId.id);
            this.saveCache();

            return userId.id;
            
        } catch (error) {
            if (error.message.includes('session')) throw error;
            throw new Error(`Failed to fetch user info for ${username}: ${error.message}`);
        }
    }

    async fetchTotalCount(username) {
        try {
            const url = `${this.baseUrl}/${username}/`;
            const response = await fetch(url, { headers: this.getUserIDHeaders()});
                    
            if (response.status === 404) return null;
            if (response.status === 429) throw new Error('Rate limited (429). Wait a few minutes before retrying.');
            if (response.status === 401) throw new Error('Invalid or expired Session ID. Please update INSTAGRAM_SESSION_ID in .env');
            if (!response.ok) throw new Error(`Instagram returned status ${response.status}`);

            // Check if the URL we're redirected to is the login page, authentication page, or directly challenged
            if (/accounts\/login|auth_platform|challenge/.test(response.url)) {
                throw new Error('Session invalid or challenged. Update cookies in .env');
            }

            const html = await response.text();

            const { followers, following } = await this.parseHtmlFoConnectionsCount(html);

            if (!followers) {throw new Error("Unable to find followers")};
            if (!following) {throw new Error("Unable to find following")};

            return Number(followers) + Number(following);
            
        } catch (error) {
            if (error.message.includes('session')) throw error;
            throw new Error(`Failed to fetch user info for ${username}: ${error.message}`);
        }
    }



    // Fetch paginated followers list via friendships endpoint //
    async fetchFollowersList(userId, username) {
        const cacheKey = `followers_${username}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const followers = [];
        let maxId = null;
        let hasMore = true;

        // try{
            while (hasMore){
                const params = new URLSearchParams({ count: USERS_PER_SCAN });

                if (maxId) params.set('max_id', maxId);
                
                const url = `${this.baseUrl}/api/v1/friendships/${userId}/followers/?${params}`;
                const headers = this.getHeaders(username)

                const response = await fetch(url, { headers: headers });

                if (response.status === 401) {
                    throw new Error('Invalid or expired session ID. Please update INSTAGRAM_SESSION_ID in .env');
                }
                if (!response.ok) {
                    throw new Error(`followers request failed with status ${response.status} for ${username}`);
                }
                
                const data = await response.json();
                const users = data.users || [];
                users.forEach(user => {
                    if (user.username) {
                        followers.push({
                            username: user.username,
                            id: user.pk,
                            full_name: user.full_name || '',
                            profile_pic_url: user.profile_pic_url || '',
                        });
                    }
                });
                // Pagination: Instagram uses next_max_id
                hasMore = !!data.next_max_id && users.length > 0;
                maxId = data.next_max_id || null;
                // Respect rate limits

                console.log(maxId);

                if (hasMore) await this.delay(this.randomBetween(MIN_SCAN_DELAY, MAX_SCAN_DELAY));

            } 
        // } 

        const uniqueFollowers = followers.filter((obj, index, self) => index === self.findIndex((t) => t.id === obj.id))

        this.cache.set(cacheKey, uniqueFollowers);
        this.saveCache();

        return uniqueFollowers;
    }

    // Fetch paginated following list via friendships endpoint //
    async fetchFollowingList(userId, username) {
        const cacheKey = `following_${username}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const following = [];
        let maxId = null;
        let hasMore = true;

        // try{
            while (hasMore){
                const params = new URLSearchParams({ count: USERS_PER_SCAN });

                if (maxId) params.set('max_id', maxId);
                
                const url = `${this.baseUrl}/api/v1/friendships/${userId}/following/?${params}`;
                const headers = this.getHeaders(username)

                const response = await fetch(url, { headers: headers });

                if (response.status === 401) {
                    throw new Error('Invalid or expired session ID. Please update INSTAGRAM_SESSION_ID in .env');
                }
                if (!response.ok) {
                    throw new Error(`following request failed with status ${response.status} for ${username}`);
                }
                
                const data = await response.json();
                const users = data.users || [];
                users.forEach(user => {
                    if (user.username) {
                        following.push({
                            username: user.username,
                            id: user.pk,
                            full_name: user.full_name || '',
                            profile_pic_url: user.profile_pic_url || '',
                        });
                    }
                });
                // Pagination: Instagram uses next_max_id
                hasMore = !!data.next_max_id && users.length > 0;
                maxId = data.next_max_id || null;
                // Respect rate limits

                console.log(maxId);

                if (hasMore) await this.delay(this.randomBetween(MIN_SCAN_DELAY, MAX_SCAN_DELAY));

            } 
        // } 

        const uniqueFollowing = following.filter((obj, index, self) => index === self.findIndex((t) => t.id === obj.id))

        this.cache.set(cacheKey, uniqueFollowing);
        this.saveCache();

        return uniqueFollowing;
    }

    findIntersection(followerArrays, booleanOperator) {
        if (followerArrays.length === 0) return [];
        if (followerArrays.length === 1) return followerArrays[0];

        const sets = followerArrays.map(
            followers => new Set(followers.map(f => f.username))
        );

        if (!booleanOperator) {
            return followerArrays[0].filter(
                follower => sets.slice(1).every(set => set.has(follower.username))
            );
        }

        if (booleanOperator == "and") {
            return followerArrays[0].filter(
                follower => sets.slice(1).every(set => set.has(follower.username))
            );
        } else if (booleanOperator == "not") {
            return followerArrays[0].filter(
                follower => sets.slice(1).every(set => !set.has(follower.username))
            );
        }
    }

    getHeaders(username){
        return{
            ...this.baseHeaders,
            'Referer': `${this.baseUrl}/${username}/`
        };
    }

    getUserIDHeaders(){
        return {
            'User-Agent': this.baseHeaders['User-Agent'],
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Ch-Ua': this.baseHeaders['Sec-Ch-Ua'],
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Linux"',
            'Cookie': this.baseHeaders['Cookie'],
            'Referer': `${this.baseUrl}/`
        };
    }

    // Scan through HTML text for a user's UserId //
    async parseHtmlForUserId(html){
        const re =  /"profile_id":"(\d+)"/g;

        // Full Match (m[0]) is the entire captured text
        // Group 1 (m[1]) is the ID
        // Group 2 (m[2]) is if the acc is private or not
        for (const m of html.matchAll(re)) {
            if (m[1] === String(process.env.DS_USER_ID)) continue; // skip your own account
            return { id: m[1] };
        }
        return null;
    }

    async parseHtmlFoConnectionsCount(html){
        const re =  /content="(\d+) Followers, (\d+) Following/g;

        // Full Match (m[0]) is the entire captured text
        // Group 1 (m[1]) is the followers
        // Group 2 (m[2]) is the following
        for (const m of html.matchAll(re)) {
            return { followers: m[1], following: m[2] };
        }
        return null;
    }


    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clearCache() {
        this.cache.clear();
        this.saveCache();
    }

    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    loadCache() {
        try {
            const entries = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
            this.cache = new Map(entries);
        } catch (err) {
            if (err.code !== 'ENOENT') console.warn(`Could not load cache: ${err.message}`); // ENOENT = first run, no file yet
        }
    }

    saveCache() {
        try {
            const tmp = `${this.cacheFile}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify([...this.cache]));
            fs.renameSync(tmp, this.cacheFile);
        } catch (err) {
            console.warn(`Could not save cache: ${err.message}`);
        }
    }
}

module.exports = new InstagramService();