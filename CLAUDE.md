# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
必ず日本語で回答ください
最後はbuildして、distフォルダをzip化までしてください

## Project Overview

This repository appears to be for a personal information masking tool/library, likely focused on data privacy and security. The project uses Node.js version 20.15.0.

## Development Environment

- **Node.js Version**: 20.15.0 (specified in .node-version)
- **Project Type**: Node.js project for personal information masking/privacy tools

## Commands

```bash
# Install dependencies
npm install

# Development build
npm run build:dev

# Production build
npm run build

# Watch mode for development
npm run watch

# Type checking
npm run type-check

# Clean build artifacts
npm run clean
```

## Architecture Notes

Chrome Extension for real-time personal information masking with the following structure:

### Core Components
- **Background Script** (`src/background/`): Extension lifecycle management, settings storage
- **Content Script** (`src/content/`): DOM manipulation, real-time PII detection and masking
- **Popup UI** (`src/popup/`): User interface for settings and controls

### Utility Modules
- **PII Detector** (`src/utils/pii-detector.ts`): Advanced pattern matching with context awareness
- **PII Patterns** (`src/utils/pii-patterns.ts`): Japanese-optimized detection patterns
- **Masking Engine** (`src/utils/masking-engine.ts`): Canvas-based visual effects (mosaic, blur, pixelate, blackout)

### Key Features
- Real-time DOM monitoring with MutationObserver
- Context-aware PII detection (form fields, nearby text analysis)
- Multiple masking algorithms with configurable intensity
- Japanese language support (names, addresses, phone numbers)
- Privacy-first design (all processing local, no external communication)

## Security Considerations

Given the nature of personal information masking:
- All data processing should happen locally when possible
- No sensitive data should be logged or persisted unintentionally
- Input validation should be thorough for all masking operations
- Consider GDPR, CCPA, and other privacy regulation compliance
