#!/bin/bash

npm uninstall -g @vybestack/llxprt-code
npm run build:packages
npm run bundle
npm link
