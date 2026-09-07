import { describe, expect, it } from 'vitest';

import { AUTOSAR_R22_CAN_PROFILE, applyDbcPolicyOverrides, resolveDbcProfile } from '../profile.js';

describe('DBC import profile', () => {
  it('exposes the built-in R22 profile and deterministic default policy', () => {
    expect(AUTOSAR_R22_CAN_PROFILE.profileId).toBe('autosar-r22-can');
    expect(AUTOSAR_R22_CAN_PROFILE.schemaVersion).toBe(1);
    expect(AUTOSAR_R22_CAN_PROFILE.modules.Com.ipduContainerKeys).toContain('ComConfig/ComIPdu');
    expect(AUTOSAR_R22_CAN_PROFILE.modules.CanIf.pduIdPolicy).toEqual({
      scope: 'perDirection',
      txBase: 0x0000,
      rxBase: 0x1000,
      step: 1,
      order: 'document-order',
    });
    expect(AUTOSAR_R22_CAN_PROFILE.modules.CanIf.upperLayerNaming.enabled).toBe(false);
  });

  it('applies overrides immutably', () => {
    const overridden = applyDbcPolicyOverrides(
      AUTOSAR_R22_CAN_PROFILE,
      { txBase: 16, order: 'shortName-order' },
      { enabled: true, txTemplate: '{module}_{pdu}_TxConfirmation' },
    );
    expect(overridden.modules.CanIf.pduIdPolicy.txBase).toBe(16);
    expect(overridden.modules.CanIf.pduIdPolicy.rxBase).toBe(0x1000);
    expect(overridden.modules.CanIf.upperLayerNaming.enabled).toBe(true);
    expect(AUTOSAR_R22_CAN_PROFILE.modules.CanIf.upperLayerNaming.enabled).toBe(false);
  });

  it('rejects unknown profiles', () => {
    expect(() => resolveDbcProfile('vendor-unknown')).toThrowError('dbc-profile-not-found');
  });
});
