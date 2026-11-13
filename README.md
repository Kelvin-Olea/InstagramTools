# Instagram Tools

A Node.js/Express web app for exploring Instagram follower and following lists. Scan multiple accounts, find the people they have in common, and visualize how everyone connects as an interactive graph.

> Forked from [OscarFromNZ/InstagramMutualFollowerChecker](https://github.com/OscarFromNZ/InstagramMutualFollowerChecker). This fork adds a tabbed Target Profiles interface, a cached user store, and a graph map view.

## ❗ Warning ❗

This tool talks to Instagram's private API using your session cookie. Using it risks getting your account **flagged, restricted, or banned**. Use it at your own risk, ideally with an account you can afford to lose.

## Features

- ✅ Check mutual followers between multiple Instagram accounts
- ✅ Works with public accounts and private accounts you follow
- ✅ Tabbed **Target Profiles** section for managing and scanning followers/following
- ✅ **Generate Map** tab: an Obsidian-style graph of every cached user, with nodes linked when they follow each other
- ✅ In-memory cache of scanned users so you don't re-fetch the same lists

## Graph Map

The **Generate Map** tab renders all currently cached users as nodes in a force-style graph. Two nodes are connected when the users are friends.

To keep the graph readable:

- Users you haven't scanned directly are hidden if they only have a single connection.
- Nodes that merely bridge two scanned nodes that are already directly connected are removed.

## Requirements

- Node.js (v12 or higher)
- npm or yarn
- An Instagram account and its `sessionid` cookie

## Installation

1. Clone the project:
   ```bash
   git clone <your-fork-url>
   ```
2. Navigate into the project:
   ```bash
   cd <your-repo-folder>/
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file in the root directory:
   ```
   SECRET=replace_with_a_long_random_string
   PORT=3000
   INSTAGRAM_SESSION_ID=your_instagram_sessionid_cookie
   ```

### Finding your session ID

Log in to instagram.com in your browser, open developer tools, and look under **Application → Cookies → https://www.instagram.com** for the `sessionid` value. Treat it like a password and never commit your `.env` file.

## Usage

1. Start the server:
   ```bash
   npm start
   ```
   Or run directly:
   ```bash
   node index.js
   ```
2. Open your browser to:
   ```
   http://localhost:3000
   ```
3. In **Target Profiles**, enter at least 2 Instagram usernames. Large accounts take a long time; keeping each under about 10k followers is recommended.
4. Click **Find Mutual Followers** to see the overlap.
5. Switch to the **Generate Map** tab to visualize the cached users and their connections.

## Project Structure

```
├── index.js                      # Entry point
├── Website.js                    # Express app setup
├── package.json                  # Dependencies
├── routes/
│   ├── homeRoutes.js            # Home page route
│   └── apiRoutes.js             # API endpoints
├── services/
│   └── instagramService.js      # Instagram API logic and user cache
├── public/
│   └── styles.css               # Frontend styling
└── views/
    └── index.ejs                # Page template (tabs, map panel)
```

## API Endpoints

### POST /api/mutual-followers

Get mutual followers between multiple Instagram accounts.

**Request:**
```json
{
  "usernames": ["username1", "username2", "username3"]
}
```

**Response:**
```json
{
  "success": true,
  "usernames": ["username1", "username2"],
  "mutualFollowers": [
    {
      "username": "follower_username",
      "id": "user_id",
      "full_name": "Follower Name",
      "profile_pic_url": "https://..."
    }
  ],
  "count": 5
}
```

### GET /api/profile/:username

Get profile information for a specific account.

**Response:**
```json
{
  "success": true,
  "profile": {
    "username": "username",
    "full_name": "Full Name",
    "biography": "Bio text",
    "followers_count": 1000,
    "following_count": 500,
    "is_private": false,
    "is_verified": true,
    "profile_pic_url": "https://...",
    "posts_count": 100
  }
}
```

## Caching

Scanned users are stored in an in-memory cache inside `InstagramService`. All usernames are lowercased before they enter the cache, so `Username` and `username` resolve to the same entry. The cache lives only as long as the server process; restarting the server clears it.

## Dependencies

- **express**: Web framework
- **express-session**: Session management
- **ejs**: Template engine
- **node-fetch**: HTTP requests to Instagram's API
- **insta-api**: Instagram API wrapper
- **dotenv**: Environment variable management

## Limitations

1. **Accessible accounts only**: Works with public accounts and private accounts your logged-in account follows.
2. **Large follower lists**: Fetching very large lists (10k+) can take significant time and memory.
3. **Private API**: Instagram can change or block these endpoints at any time, and heavy use may trigger rate limits or account restrictions.

## Troubleshooting

### "Account is private - Only public accounts can be checked"
- Verify that the account you logged in with follows the target account.

### "Username not found"
- Check the spelling.
- Confirm the username on Instagram's website first.

### Requests suddenly failing
- Your `sessionid` may have expired or been invalidated. Log in again and update `.env`.
- Stop scanning for a while; you may be rate limited.

## License

ISC

---

**Note**: This app scrapes Instagram data. Respect Instagram's Terms of Service and use it responsibly.
