# Instagram Tools

A Node.js/Express web app for exploring Instagram follower and following lists. Scan an account to find its real friends (people it follows who follow it back), filter cached lists against each other, and visualize how everyone connects as an interactive graph.

> Forked from [OscarFromNZ/InstagramMutualFollowerChecker](https://github.com/OscarFromNZ/InstagramMutualFollowerChecker). This fork adds a tabbed Target Profiles interface, a cached user store, a graph map view, and more in-depth API calls to simulate human action to avoid detection.

## ❗ Warning ❗

This tool sends requests to Instagram using your logged-in session cookies. Using it risks getting your account **flagged, restricted, or banned**. Use it at your own risk, ideally with an account you can afford to lose. The request pacing described below lowers the odds of being flagged but does not eliminate them.

## Features

- ✅ **Friends tab**: scan one profile and get everyone who both follows them and is followed by them
- ✅ **Filter tab**: combine two cached lists (friends, followers, or following) with `AND` / `NOT`
- ✅ **Map tab**: an Obsidian-style force graph of every scanned user and how they connect
- ✅ Works with public accounts and private accounts your logged-in account follows
- ✅ Persistent cache, so a profile only has to be scanned once
- ✅ Time estimate shown before a scan starts
- ✅ Human-like request behavior (see [How it avoids detection](#how-it-avoids-detection))

## How it works

### Friends

Enter a username on the **Friends** tab. The app fetches that user's followers and following lists, then keeps only the accounts that appear in both. The result is cached under that username.

### Filter

The **Filter** tab works only on lists that are already in the cache, so scan the users first. Pick a username and a list type (`friends`, `followers`, or `following`) for each side, then choose an operator:

| Operator | Result |
|----------|--------|
| `AND` | Users that appear in **both** lists |
| `NOT` | Users in the first list that are **not** in the second |

### Map

The **Map** tab draws every cached friends list as a graph using [D3](https://d3js.org/) (loaded from a CDN). Scanned users have a purple outline, node size grows with the number of connections, and you can zoom, pan, and drag nodes.

To keep the graph readable, the server trims it before sending:

- If two scanned users are directly linked to each other, the non-scanned friends they share are disconnected from both, since they only add clutter. If two scanned users are *not* directly linked, shared friends are kept as the bridge between them.
- After trimming, non-scanned users with fewer than 2 connections are removed.

Profile pictures are intentionally disabled on the map so nobody's photo is shown by default.

## How it avoids detection

- **Randomized delays**: a random 6 to 10 second pause between every paginated request and between lookups
- **Small pages**: followers and following are fetched 25 users at a time, like the website does
- **Browser-like requests**: realistic user agent, `sec-ch-ua` / `sec-fetch-*` headers, `Referer`, and your own session cookies
- **Cache first**: anything already scanned is never requested again
- **Rate limit handling**: expired sessions, challenges, and `429` responses stop the scan with a clear error instead of retrying

## Requirements

- Node.js 14 or higher
- npm or yarn
- An Instagram account that is logged in on your browser

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
   INSTAGRAM_SESSION_ID=your_sessionid_cookie
   CSRF_TOKEN=your_csrftoken_cookie
   DS_USER_ID=your_ds_user_id_cookie
   X_ASBD_ID=your_x_asbd_id_header
   ```

### Environment variables

| Variable | What it is |
|----------|-----------|
| `SECRET` | Signing key for the app's own `express-session` cookies. Not related to Instagram. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | Port the server listens on. Required. |
| `INSTAGRAM_SESSION_ID` | Your `sessionid` cookie |
| `CSRF_TOKEN` | Your `csrftoken` cookie |
| `DS_USER_ID` | Your `ds_user_id` cookie (your numeric account ID). Also used to skip your own account when looking up user IDs. |
| `X_ASBD_ID` | The `X-ASBD-ID` request header Instagram's website sends |

### Finding your Instagram values

1. Log in to instagram.com in your browser and open developer tools.
2. Under **Application → Cookies → https://www.instagram.com**, copy `sessionid`, `csrftoken`, and `ds_user_id`.
3. Under the **Network** tab, click any `api/v1` request and copy the `x-asbd-id` request header.

Treat these values like passwords. **NEVER** commit them.

### Keep private files out of git

Add this to your `.gitignore`:

```
node_modules/
.env
cache.json
```

`cache.json` contains the usernames, display names, and profile picture URLs of everyone you've scanned, so it should never be published.

## Usage

1. Start the server:
   ```bash
   npm start
   ```
   Or run directly:
   ```bash
   node index.js
   ```
2. Open your browser to `http://localhost:3000` (or whatever `PORT` you set).
3. On the **Friends** tab, enter a username and run a scan. The app shows an estimated time first. Large accounts take a long time.
4. Use the **Filter** tab to compare cached lists, and the **Map** tab to generate the graph.

## Project Structure

```
├── index.js                      # Entry point
├── Website.js                    # Express app and session setup
├── package.json                  # Dependencies
├── cache.json                    # Generated on first scan (gitignored)
├── .env                          # Your secrets (gitignored)
├── routes/
│   ├── homeRoutes.js            # Home page route
│   └── apiRoutes.js             # API endpoints and image proxy
├── services/
│   └── instagramService.js      # Instagram requests, cache, filtering, map logic
├── public/
│   └── styles.css               # Frontend styling
└── views/
    └── index.ejs                # Page template (tabs, results, D3 map)
```

## Cache

Everything the app fetches is stored in a `Map` and saved to `cache.json` after each step, using a write-then-rename so the file can't be left half-written. Entries are keyed by type and username, and all usernames are lowercased before they enter the cache:

| Key | Contents |
|-----|----------|
| `userid_<username>` | Numeric Instagram user ID |
| `followers_<username>` | Followers list |
| `following_<username>` | Following list |
| `friends_<username>` | Followers ∩ following |

The cache never expires. To refresh a user's data or start over, delete `cache.json` and restart the server.

## API Endpoints

### POST /api/friends

Scan a profile and return its friends.

**Request:**
```json
{ "username": ["target_user"] }
```

**Response:**
```json
{
  "success": true,
  "usernames": "target_user",
  "usersList": [
    {
      "username": "friend_username",
      "id": "user_id",
      "full_name": "Friend Name",
      "profile_pic_url": "https://..."
    }
  ],
  "count": 42
}
```

### POST /api/friends/estimate

Estimated scan time in seconds. Returns `0` if the user is already cached.

**Request:**
```json
{ "username": ["target_user"] }
```

**Response:**
```json
{ "success": true, "estimatedSeconds": 310 }
```

### POST /api/filter-lists

Combine two **cached** lists. Each entry is `[username, listType]` where `listType` is `friends`, `followers`, or `following`, and `booleanOperator` is `"and"` or `"not"`. At least 2 entries are required. Returns an error if either list isn't cached yet.

**Request:**
```json
{
  "filterUsernames": [["user_one", "followers"], ["user_two", "following"]],
  "booleanOperator": "and"
}
```

**Response:**
```json
{
  "success": true,
  "usernames": [["user_one", "followers"], ["user_two", "following"]],
  "usersList": [ { "username": "...", "id": "...", "full_name": "...", "profile_pic_url": "..." } ],
  "count": 7
}
```

### GET /api/map

Graph data built from every cached friends list.

**Response:**
```json
{
  "success": true,
  "nodes": [
    { "id": "username", "scanned": true, "pic": "", "totalLinks": 12 }
  ],
  "links": [
    { "source": "username", "target": "other_username" }
  ],
  "count": 1
}
```

### GET /pfp?url=...

Image proxy so the browser can load Instagram profile pictures. Only HTTPS URLs on `cdninstagram.com` and `fbcdn.net` are allowed, and expired image URLs return `410`.

## Dependencies

- **express**: Web framework
- **express-session**: Session management
- **ejs**: Template engine
- **node-fetch** (v2): HTTP requests to Instagram
- **dotenv**: Environment variable management
- **d3** (v7, via CDN): Graph rendering in the browser

## Limitations

1. **Scan before you filter**: the Filter tab only reads from the cache.
2. **Two lists at a time**: filtering is limited to two users at once.
3. **Large accounts are slow**: with 6 to 10 seconds between pages of 25, scans scale linearly with follower and following counts, and 10k+ accounts can take hours.
4. **Private accounts**: your logged-in account must follow them. The app doesn't check this ahead of time, so a scan of an inaccessible account will fail partway.
5. **Unofficial endpoints**: Instagram can change or block these requests at any time, and the user ID and count lookups depend on the profile page's HTML.

## Troubleshooting

### "Invalid or expired session ID"
- Your `sessionid` cookie has expired. Log in again and update `.env`, then restart the server.

### "Session invalid or challenged"
- Instagram redirected to a login or challenge page. Log in through your browser, complete any prompt, then refresh your cookies in `.env`. Recommended to wait a couple hours before re-trying to prevent being challenged again.

### "Rate limited (429)"
- Stop scanning and wait several minutes (longer if it keeps happening).

### "Could not find user" / "Failed to fetch user info"
- Check the spelling and confirm the profile exists on Instagram's website.
- For private accounts, make sure your logged-in account follows them.

### "User ... does not exist in the cache"
- Run that user through the Friends tab before using the Filter tab.

### Console warnings about missing `.env` values
- The server prints a warning for the first missing variable among `INSTAGRAM_SESSION_ID`, `CSRF_TOKEN`, `DS_USER_ID`, and `X_ASBD_ID`.

## License

ISC

---

**Note**: This app scrapes Instagram data and is not affiliated with or endorsed by Instagram or Meta. Use at your own risk.
