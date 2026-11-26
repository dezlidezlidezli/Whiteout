import { Builder, bevel } from '../geo';
import type { PropSpec } from './common';
const ph = (c: number): PropSpec => ({ layers: [{ name: 'body', b: new Builder().add(bevel(1.5, 1.5, 1.5), c, { p: [0, 0.75, 0] }) }], userData: { radius: 1 } });
export const sawmill = () => ph(0x9a6b3f);
export const smokehouse = () => ph(0x6b4528);
export const forge = () => ph(0x666d7a);
export const greatKitchen = () => ph(0xd07a3c);
export const conveyor = () => ph(0x4a4f5a);
