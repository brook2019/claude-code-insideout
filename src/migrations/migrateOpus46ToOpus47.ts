import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import {
  isMaxSubscriber,
  isProSubscriber,
  isTeamPremiumSubscriber,
} from '../utils/auth.js'
import { getAPIProvider } from '../utils/model/providers.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'

/**
 * Migrate Pro/Max/Team Premium first-party users off explicit Opus 4.6
 * model strings to the 'opus' alias (which now resolves to Opus 4.7).
 *
 * Reads userSettings specifically (not merged) so we only migrate what /model
 * wrote — project/local pins are left alone.
 * Idempotent: only writes if userSettings.model matches an Opus 4.6 string.
 */
export function migrateOpus46ToOpus47(): void {
  if (getAPIProvider() !== 'firstParty') {
    return
  }

  if (!isProSubscriber() && !isMaxSubscriber() && !isTeamPremiumSubscriber()) {
    return
  }

  const model = getSettingsForSource('userSettings')?.model
  if (
    model !== 'claude-opus-4-6' &&
    model !== 'claude-opus-4-6[1m]' &&
    model !== 'opus-4-6' &&
    model !== 'opus-4-6[1m]'
  ) {
    return
  }

  const has1m = model.endsWith('[1m]')
  updateSettingsForSource('userSettings', {
    model: has1m ? 'opus[1m]' : 'opus',
  })

  logEvent('tengu_opus46_to_47_migration', {
    from_model:
      model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    has_1m: has1m,
  })
}
