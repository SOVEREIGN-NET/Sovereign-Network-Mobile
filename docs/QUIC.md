Native QUIC Implementation Plan

  Overview

  Your development node at 77.42.37.161:9334 requires pure QUIC connections. Since
  React Native's built-in fetch() uses HTTP/HTTPS only, we need native
  implementations for both platforms.

  Architecture

  ┌─────────────────────────────────────────────────────────────┐
  │                  React Native (JavaScript)                  │
  │  ┌─────────────────────────────────────────────────────────┐│
  │  │  QuicClient.ts (JavaScript Bridge)                      ││
  │  │  - request(url, method, headers, body) → Response       ││
  │  │  - isSupported() → boolean                              ││
  │  │  - testConnection(host, port) → health info             ││
  │  └─────────────────────────────────────────────────────────┘│
  └─────────────────────────────────────────────────────────────┘
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
  ┌───────────────────────┐               ┌───────────────────────┐
  │   iOS (Swift)         │               │   Android (Kotlin)    │
  │   NativeQuicModule    │               │   NativeQuicModule    │
  │                       │               │                       │
  │   Network.framework   │               │   Cronet Library      │
  │   NWProtocolQUIC      │               │   (Play Services)     │
  │   NWConnectionGroup   │               │                       │
  │   (iOS 15+)           │               │   enableQuic(true)    │
  └───────────────────────┘               └───────────────────────┘
          │                                           │
          ▼                                           ▼
  ┌─────────────────────────────────────────────────────────────┐
  │              QUIC Server: 77.42.37.161:9334                 │
  │              ALPN: zhtp/1.0                                 │
  └─────────────────────────────────────────────────────────────┘

  ---
  Platform Implementation Details

  iOS: Network.framework (Built-in, iOS 15+)

  Apple's Network.framework has native QUIC support via NWProtocolQUIC. No external
   dependencies needed.

  Key Components:
  - NWConnectionGroup for multiplexed QUIC streams
  - NWMultiplexGroup descriptor
  - TLS 1.3 with custom ALPN (zhtp/1.0)
  - Support for self-signed certs (dev mode)

  Files to Create:
  | File                                              | Purpose
       |
  |---------------------------------------------------|----------------------------
  -----|
  | ios/SovereignNetworkMobile/NativeQuicModule.swift | Main QUIC client
  implementation |
  | ios/SovereignNetworkMobile/NativeQuicModule.m     | Objective-C bridge
       |

  ---
  Android: Cronet (Google's QUIC stack)

  Using Play Services Cronet (recommended - only ~30KB overhead vs 10MB embedded).

  Key Components:
  - CronetEngine.Builder with enableQuic(true)
  - QuicOptions.Builder for QUIC-specific settings
  - addQuicHint() to allowlist QUIC hosts
  - Play Services provider for automatic updates

  Files to Create:
  | File                             | Purpose                           |
  |----------------------------------|-----------------------------------|
  | android/.../NativeQuicModule.kt  | Main QUIC client implementation   |
  | android/.../NativeQuicPackage.kt | React Native package registration |

  Dependencies to Add (build.gradle):
  implementation 'com.google.android.gms:play-services-cronet:18.1.0'
  implementation 'org.chromium.net:cronet-api:119.6045.31'

  ---
  JavaScript Bridge

  Files to Create:
  | File                             | Purpose                                 |
  |----------------------------------|-----------------------------------------|
  | src/services/QuicClient.ts       | Platform-agnostic QUIC wrapper          |
  | src/services/QuicFetchAdapter.ts | FetchAdapter implementation for ZhtpApi |

  ---
  Integration with @sovereign-net/api-client

  According to the QUIC docs you shared, the library supports custom fetch
  adapters:

  // QuicFetchAdapter.ts
  import QuicClient from './QuicClient';
  import type { FetchAdapter } from '@sovereign-net/api-client';

  export const createQuicFetchAdapter = (): FetchAdapter => {
    return async (url, options) => {
      const response = await QuicClient.request({
        url,
        method: options?.method || 'GET',
        headers: options?.headers,
        body: options?.body,
      });

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
        json: async () => JSON.parse(response.body),
        text: async () => response.body,
      } as Response;
    };
  };

  Update ApiContext.tsx:
  const api = new ZhtpApi(configProvider, quicFetchAdapter);

  ---
  Configuration

  | Setting            | Value                    |
  |--------------------|--------------------------|
  | Development Node   | quic://77.42.37.161:9334 |
  | ALPN               | zhtp/1.0                 |
  | TLS                | 1.3 (required by QUIC)   |
  | Self-signed Certs  | Allowed in dev           |
  | Connection Timeout | 30 seconds               |
  | Max Streams        | Configurable             |

  ---
  File Summary

  | Platform   | Files                           | LOC Estimate |
  |------------|---------------------------------|--------------|
  | iOS        | 2 files (Swift + ObjC bridge)   | ~250 lines   |
  | Android    | 2 files (Kotlin + Package)      | ~200 lines   |
  | JavaScript | 2 files (Client + Adapter)      | ~100 lines   |
  | Config     | 2 files (build.gradle, Podfile) | ~10 lines    |
  | Total      | 8 files                         | ~560 lines   |

  ---
  Key Technical Considerations

  1. iOS Requirements:
    - Minimum iOS 15 (Network.framework QUIC support)
    - Need to handle NWConnection.State.preparing timeouts
    - Connection migration supported automatically
  2. Android Requirements:
    - Play Services installed (most devices)
    - Fallback to embedded Cronet if Play Services unavailable
    - Need to add QUIC hint for the target host
  3. TLS/Certificate Handling:

  ---
  Wallet List Response Example

  For identity `d0717dc43ff9a9d7a1fd6407eeee2c9aa30fb8e8e3302c1bb234ca450c0d39a8`,
  the wallet list response includes three wallets:

  - Primary (`wallet_d0717dc43ff9`): 5000 ZHTP (welcome bonus), can vote
  - Savings (`savings_d0717dc43ff9`): 0 ZHTP
  - UBS (`ubi_d0717dc43ff9`): 0 ZHTP

  Total balance across all wallets: 5000 ZHTP.
    - Dev mode: Accept self-signed certificates
    - Prod mode: Strict certificate validation
    - Store cert pins in secure storage
  4. Error Handling:
    - Connection timeout fallback
    - QUIC unavailable → HTTP fallback option
    - Network change handling (connection migration)

  ---
  Sources

  - https://developer.apple.com/documentation/network/nwprotocolquic
  - https://developer.apple.com/videos/play/wwdc2021/10094/
  - https://developer.apple.com/forums/tags/quic
  - https://github.com/google/cronet-transport-for-okhttp
  - https://github.com/VKCOM/KNet
  - https://www.npmjs.com/package/react-native-cronet
  - https://www.whitespectre.com/ideas/building-native-modules-for-react-native-wit
  h-kotlin-and-swift/

  ---

⏺ Would you like me to proceed with implementing this plan? I can start with
  either:

  1. iOS first - Using Apple's built-in Network.framework (no dependencies)
  2. Android first - Using Cronet with Play Services
  3. JavaScript bridge first - The common interface layer
  4. All in parallel - Implement everything at once
