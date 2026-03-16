import React, { useEffect, useRef } from 'react';
import {
  requireNativeComponent,
  Platform,
  ViewProps,
  NativeSyntheticEvent,
} from 'react-native';

type Web4NavigationEvent = NativeSyntheticEvent<{
  url: string;
  navigationType: 'load' | 'redirect' | 'error';
  code?: number;
  message?: string;
}>;

type Web4ErrorEvent = NativeSyntheticEvent<{
  code: string;
  message: string;
}>;

export interface Web4ViewProps extends ViewProps {
  domain: string;
  embeddedApp?: string;
  hostHeader?: string;
  nodeHost?: string;
  nodePort?: number;
  cacheLimitMb?: number;
  allowHttpsExternal?: boolean;
  style?: any;
  onNavigation?: (event: Web4NavigationEvent) => void;
  onLoadStart?: (event: Web4NavigationEvent) => void;
  onLoadEnd?: (event: Web4NavigationEvent) => void;
  onContentVerified?: (event: { contentId: string; cid: string }) => void;
  onError?: (event: Web4ErrorEvent) => void;
}

const ComponentName = 'Web4View';

// UIManager.getViewManagerConfig() always returns null on React Native New
// Architecture (0.74+). Use requireNativeComponent directly and catch the
// error thrown when the native module is genuinely absent instead.
let NativeWeb4View: ReturnType<typeof requireNativeComponent<Web4ViewProps>> | null =
  null;
let isWeb4ViewAvailable = false;
try {
  NativeWeb4View = requireNativeComponent<Web4ViewProps>(ComponentName);
  isWeb4ViewAvailable = true;
} catch (_e) {
  // Native module not linked — component renders nothing (see fallback below).
}

export { isWeb4ViewAvailable };

export const Web4View: React.FC<Web4ViewProps> = props => {
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!isWeb4ViewAvailable && !warnedRef.current) {
      warnedRef.current = true;
      console.warn(
        `Web4View native component is not linked. Ensure pods/Gradle are rebuilt. Platform=${Platform.OS}`,
      );
    }
  }, []);

  useEffect(() => {
    if (__DEV__) {
      console.log('[🌐 Web4] Web4View: Mounted -', props.domain);
    }
  }, [props.domain, props.nodeHost, props.nodePort, props.cacheLimitMb]);

  if (!isWeb4ViewAvailable || !NativeWeb4View) {
    return null;
  }

  return (
    <NativeWeb4View
      {...props}
      style={[{ backgroundColor: 'transparent' }, props.style]}
    />
  );
};

export default Web4View;
