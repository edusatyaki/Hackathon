#!/bin/bash
# Hackfest Tailwind CSS Build Script
# Uses the standalone Tailwind CLI binary

./tailwindcss -i tailwind-input.css -o dist/output.css --minify
