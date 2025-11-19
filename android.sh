#!/bin/bash
# Helper script to build Android with proper NODE_BINARY path
# Usage: ./android.sh or npm run android

NODE_BINARY=$(dirname $(dirname $(command -v node)))/bin/node npm run android
