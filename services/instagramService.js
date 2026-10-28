const fetch = require('node-fetch');
require('dotenv').config();

class InstagramService {
    constructor() {
        this.baseUrl = 'https://www.instagram.com';
        this.cache = new Map();
        this.currentTargetProfile = ''

        if (!process.env.INSTAGRAM_SESSION_ID) {
            console.warn('WARNING: INSTAGRAM_SESSION_ID is not set in .env');
        } else if (!process.env.CSRF_TOKEN) {
            console.warn('WARNING: CSRF_TOKEN is not set in .env');
        } else if (!process.env.DS_USER_ID) {
            console.warn('WARNING: DS_USER_ID is not set in .env');
        }

        this.headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US',
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Ch-Ua-Platform': '"Linux"',
            'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
            'Sec-Ch-Ua-Mobile': '?0',

            'Cookie': `sessionid=${process.env.INSTAGRAM_SESSION_ID}; csrftoken=${process.env.CSRF_TOKEN}; ds_user_id=${process.env.DS_USER_ID}`,
            'X-Csrftoken': `${process.env.CSRF_TOKEN}`,
        };
    }

    getHeaders(){
        return{
            ...this.headers,
            'Referer': `${this.currentTargetProfile}`
        }
    }

    /**
     * Get followers for a username
     */
    async getFollowing(username, limit = 10000) {
        const cacheKey = `following_${username}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const user = {id : 58697722721, pk : 58697722721}; // Find a way to properly get instagram ID's
        // const user = await this.fetchUserInfo(username);

        // if (!user) {
        //     throw new Error(`Could not find user: ${username}`);
        // }
        // if (user.is_private) {
        //     throw new Error(`Account is private: ${username}`);
        // }

        const following = await this.fetchFollowingList(user.pk || user.id, username, limit);
        this.cache.set(cacheKey, following);
        return following;
    }

    async getFollowers(username, limit = 10000) {
        const cacheKey = `followers_${username}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const user = {id : 58697722721, pk : 58697722721};
        // const user = await this.fetchUserInfo(username);

        if (!user) {
            throw new Error(`Could not find user: ${username}`);
        }
        if (user.is_private) {
            throw new Error(`Account is private: ${username}`);
        }

        const followers = await this.fetchFollowersList(user.pk || user.id, username, limit);
        this.cache.set(cacheKey, followers);
        return followers;
    }


    /**
     * Fetch user info via web_profile_info endpoint
     */
    async fetchUserInfo(username) {
        try {
            const url = `${this.baseUrl}/users/web_profile_info/?username=${encodeURIComponent(username)}`;
            const response = await fetch(url, { headers: this.headers });

            if (response.status === 404) return null;
            if (response.status === 401) throw new Error('Invalid or expired session ID. Please update INSTAGRAM_SESSION_ID in .env');
            if (!response.ok) throw new Error(`Instagram returned status ${response.status}`);

            const data = await response.json();
            return data?.data?.user || null;
        } catch (error) {
            if (error.message.includes('session')) throw error;
            throw new Error(`Failed to fetch user info for ${username}: ${error.message}`);
        }
    }

    /**
     * Fetch paginated followers list via friendships endpoint
     */
    async fetchFollowersList(userId, username, limit = 10000) {
        const followers = [];
        let maxId = null;
        let hasMore = true;

        while (hasMore && followers.length < limit) {
            try {
                const params = new URLSearchParams({ count: '50' });
                if (maxId) params.set('max_id', maxId);

                const url = `${this.baseUrl}/friendships/${userId}/followers/?${params}`;
                const response = await fetch(url, { headers: this.headers });

                if (response.status === 401) {
                    throw new Error('Invalid or expired session ID. Please update INSTAGRAM_SESSION_ID in .env');
                }
                if (!response.ok) {
                    console.warn(`Followers request failed with status ${response.status} for ${username}`);
                    break;
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
                await this.delay(1500);
            } catch (error) {
                if (error.message.includes('session')) throw error;
                console.warn(`Failed during followers pagination for ${username}: ${error.message}`);
                break;
            }
        }

        return followers;
    }

        /**
     * Fetch paginated followers list via friendships endpoint
     */
    async fetchFollowingList(userId, username, limit = 10000) {
        const following = [];
        let maxId = null;
        let hasMore = true;

        while (hasMore && following.length < limit) {
            try {
                const params = new URLSearchParams({ count: '50' });
                if (maxId) params.set('max_id', maxId);

                const url = `${this.baseUrl}/friendships/${userId}/following/?${params}`;
                const response = await fetch(url, { headers: this.headers });

                if (response.status === 401) {
                    throw new Error('Invalid or expired session ID. Please update INSTAGRAM_SESSION_ID in .env');
                }
                if (!response.ok) {
                    console.warn(`following request failed with status ${response.status} for ${username}`);
                    break;
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
                await this.delay(1500);
            } catch (error) {
                if (error.message.includes('session')) throw error;
                console.warn(`Failed during following pagination for ${username}: ${error.message}`);
                break;
            }
        }

        return following;
    }

    /**
     * Get profile information for a username
     */
    async getProfileInfo(username) {
        const user = await this.fetchUserInfo(username);

        if (!user) {
            throw new Error(`Could not find user: ${username}`);
        }

        return {
            username: user.username,
            full_name: user.full_name || '',
            biography: user.biography || '',
            followers_count: user.edge_followed_by?.count ?? user.follower_count ?? 0,
            following_count: user.edge_follow?.count ?? user.following_count ?? 0,
            is_private: user.is_private || false,
            is_verified: user.is_verified || false,
            profile_pic_url: user.profile_pic_url_hd || user.profile_pic_url || '',
            posts_count: user.edge_owner_to_timeline_media?.count ?? user.media_count ?? 0,
        };
    }

    /**
     * Get mutual followers between 2 or more accounts
     */
    async getMutualFollowers(usernames) {
        if (!usernames || usernames.length < 2) {
            throw new Error('Please provide at least 2 usernames');
        }

        const allFollowerSets = await Promise.all(
            usernames.map(username => this.getFollowers(username))
        );

        return this.findIntersection(allFollowerSets);
    }

    async getFriends(username) {
        username = username[0];
        if (!username) {
            throw new Error('Please provide a username!');
        }

        const followers = await this.getFollowers(username);
        const following = await this.getFollowing(username);

        return this.findIntersection([followers, following]);
    }

    /**
     * Find intersection of multiple follower arrays by username
     */
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
    }
}

module.exports = new InstagramService();