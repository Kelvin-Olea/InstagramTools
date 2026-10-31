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
            await this.delay(8000); // Force wait 8 seconds after sending any html request

            this.cache.set(cacheKey, userId.id);
            this.saveCache();

            return userId.id;
            
        } catch (error) {
            if (error.message.includes('session')) throw error;
            throw new Error(`Failed to fetch user info for ${username}: ${error.message}`);
        }
    }

    // Get who user is friends with //
    async getFriends(username) {
        const cacheKey = `friends_${username}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const userId = await this.fetchUserId(username);

        if (!userId) throw new Error(`Could not find user: ${username}`);

        // Add a way to ensure the user is either public, or someone we're following //

        const followers = await this.fetchFollowersList(userId, username);
        await this.delay(this.randomBetween(8000, 12000))
        const following = await this.fetchFollowingList(userId, username);

        const friends = await this.findIntersection([followers, following]);

        this.cache.set(cacheKey, friends);
        this.saveCache();

        return friends;
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
                const params = new URLSearchParams({ count: '20' });

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

                if (hasMore) await this.delay(this.randomBetween(8000, 12000));

            } 
        // } 

        this.cache.set(cacheKey, followers);
        this.saveCache();

        return followers;
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
                const params = new URLSearchParams({ count: '20' });

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

                if (hasMore) await this.delay(this.randomBetween(8000, 12000));

            } 
        // } 

        this.cache.set(cacheKey, following);
        this.saveCache();

        return following;
    }

    findIntersection(followerArrays) {
        if (followerArrays.length === 0) return [];
        if (followerArrays.length === 1) return followerArrays[0];

        const sets = followerArrays.map(
            followers => new Set(followers.map(f => f.username))
        );

        return followerArrays[0].filter(
            follower => sets.slice(1).every(set => set.has(follower.username))
        );
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