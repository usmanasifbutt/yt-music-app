import * as Application from 'expo-application';
import Constants from 'expo-constants';

/** e.g. "1.3.0" or "1.3.0-dev.ea3c35e", read from the installed APK. */
export const APP_VERSION = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '?';

/** Assigned by EAS at build time (not in app.json). */
export const BUILD_NUMBER = Application.nativeBuildVersion ?? '?';

export const IS_BETA = !!Constants.expoConfig?.name?.endsWith('Beta');

/** "v1.3.0 (5)", plus "Beta" for test builds. */
export const VERSION_LABEL = `v${APP_VERSION} (${BUILD_NUMBER})${IS_BETA ? ' Beta' : ''}`;
