#!/bin/bash
# Quick local run - for testing only
# Requires Ollama to be running

echo "Starting Restaurant AI Toolkit..."
echo "Make sure Ollama is running: ollama serve"
echo ""
echo "Starting app on http://localhost:18790"

cd /home/james/.openclaw/workspace/restaurant-app
npm start