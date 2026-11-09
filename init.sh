#!/bin/bash

# Start the server in the background
node index.js &
SERVER_PID=$!

# Give it a moment to boot
sleep 0.5

# Open the page
xdg-open "http://localhost:3000"

# Stop the server when you press Ctrl+C
trap "kill $SERVER_PID" EXIT

# Keep the server active until we manually close it
wait $SERVER_PID