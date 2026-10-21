import type { ReactNode } from 'react';
import { RealmCreatureEye as Eye } from './RealmCreatureEye';

/** Six original drawings; coordinates share the bestiary's 64-unit canvas. */
export const REALM_CREATURE_ARTWORK: Record<string, ReactNode> = {
  'creature:4:0': <>
    <path fill="none" stroke="#9e684b" strokeWidth="9" d="M17 39Q2 30 9 16Q16 7 23 16L20 23"/>
    <path fill="#e0ad69" d="m20 16 8 1-7 12-5-5Z"/>
    <path fill="none" stroke="#6f554c" strokeWidth="3" d="m21 44-9 8-7-1m22-5-7 12-8 1m26-11 2 10-5 3m9-16 9 5 3 7"/>
    <ellipse cx="32" cy="39" rx="18" ry="12" fill="#bd844f"/>
    <path fill="#e5b97c" stroke="none" d="M17 36Q29 26 44 35L44 39Q30 34 19 43Z"/>
    <path fill="none" stroke="#916245" d="m22 31 1 13m6-16 1 16m6-15 1 15"/>
    <path fill="#d49c5e" d="M37 32Q47 23 55 31L57 43Q47 51 38 43Z"/>
    <path fill="#dea968" d="M44 36 52 24Q47 18 51 13L57 18 61 14Q66 23 59 30L52 40ZM36 40 47 48Q57 42 60 48L54 53 57 58Q47 63 40 54L31 46Z"/>
    <Eye x={49} y={34} r={2.2}/><path d="m45 30 6 1M43 41q3 3 6 0" fill="none"/>
    <path d="m9 18 6 2m-5 7 6-2m-1 8 5-3" stroke="#e9c08b" fill="none"/>
  </>,
  'creature:4:1': <>
    <path fill="#bb8656" d="M7 48Q0 37 12 35Q24 35 17 46Q14 54 31 53Q50 52 44 39L35 29 36 16 49 16Q59 26 53 36Q63 54 46 60Q19 66 8 54L3 57Z"/>
    <path fill="none" stroke="#f2d99e" strokeWidth="6" d="M13 43Q7 55 29 57Q57 59 49 40L42 29"/>
    <path fill="#d7a563" d="M32 24Q27 9 41 6Q58 5 59 20L53 32 39 34Z"/>
    <path fill="#f2d49a" d="M42 24Q47 18 60 24Q64 31 55 35L42 32Z"/>
    <path fill="#9b684c" stroke="none" d="m31 20 6-8 3 4-5 10Zm19-10 5 4-2 6-4-5Z"/>
    <Eye x={49} y={20} r={2.8}/><path d="m45 15 7 1m3 16 5-1" fill="none"/>
    <path fill="none" stroke="#9b684c" strokeWidth="2" d="m16 53-1 5m9-3v6m9-5 1 5m9-7 3 5m2-15 6 1"/>
    <path d="m58 33 4 5m-2-2 3-1" fill="none" stroke="#b7746b"/>
  </>,
  'creature:4:2': <>
    <path fill="none" stroke="#645445" strokeWidth="3" d="m19 31-9-8-5 4m13 12-12 2-3 6m17 1-8 10-8-2m40-25 10-8 5 4m-9 12 10 3 1 7m-14-1 7 9 8-2"/>
    <path fill="#8f7457" d="M15 35Q10 18 29 15Q52 13 53 36L48 50Q32 63 17 48Z"/>
    <path fill="#d0aa69" d="M17 31Q14 18 31 17L31 56Q17 55 16 42Z"/>
    <path fill="#b58c4e" d="M32 17Q52 16 51 36L47 49 32 56Z"/>
    <path fill="none" stroke="#ead299" strokeWidth="3" d="M21 27q-4 12 1 19m13-23q10 0 11 11"/>
    <path fill="#876b46" d="M23 18Q18 7 31 6Q44 5 45 17L39 27 28 25Z"/>
    <path fill="#e7c58a" d="M27 7 27 2 32 6 36 1 37 7Z"/>
    <Eye x={29} y={16} r={2.4}/><Eye x={39} y={15} r={2.4}/>
    <path d="M31 22q3 2 5-1" fill="none"/>
    <g fill="#e6ca8c" stroke="none"><circle cx="24" cy="35" r="2"/><circle cx="23" cy="42" r="1.5"/><circle cx="40" cy="39" r="2"/></g>
  </>,
  'creature:5:0': <>
    <path fill="#adc5d5" d="M19 39Q0 40 4 18L12 26 11 18Q24 26 25 40Z"/>
    <path fill="#8da5be" d="m17 43-2 13q-5 7 5 5l6-14m12-2 2 14q6 4 9-1l-1-15"/>
    <ellipse fill="#dbe9ed" cx="30" cy="42" rx="21" ry="12"/>
    <path fill="#f4f6ed" stroke="none" d="m12 39 8 3 5-6 8 5 8-4 7 5-3 8Q22 58 13 46Z"/>
    <path fill="#c3dce4" d="m30 39 1-14 5-18 10 14 10-11 3 21-6 14-13 4Z"/>
    <path fill="#e0c2d1" stroke="none" d="m37 14 1 13 6-4Zm17 4-5 11 7 1Z"/>
    <path fill="#f3f7ef" d="M45 34Q57 29 62 36Q64 44 50 47L42 40Z"/>
    <path fill="#4e647e" d="M57 34q7-2 5 4l-3 3-4-4Z"/>
    <Eye x={48} y={29}/><path d="m43 24 7 1m-1 17 6 1" fill="none"/>
    <path fill="#bfd8e2" d="m21 46 1 10q-6 7 5 5l4-13m12-2 4 10q-4 7 6 4l-1-17"/>
    <path stroke="#8aa9c4" fill="none" d="m22 59 5-1m21 0 5-1"/>
    <path stroke="#8ebfd5" fill="none" d="m31 35 3-4 3 4m-3-7v9"/>
  </>,
  'creature:5:1': <>
    <path fill="#a2becf" d="M23 31Q11 32 4 16Q3 8 12 15L11 7Q24 8 29 29ZM38 28Q43 10 59 9L55 19 62 18Q62 29 43 38Z"/>
    <path fill="#eff2e6" d="M21 26Q18 12 28 9L34 14 43 8Q55 18 50 35Q51 53 35 56Q17 54 19 39Z"/>
    <path fill="#c4dbe3" stroke="none" d="M21 36Q36 44 50 33Q53 52 35 56Q23 54 21 46Z"/>
    <path fill="#d4e4e5" d="M23 22q6-9 12 0 7-11 13-1v11q-6 7-13 0-9 8-13-1Z"/>
    <Eye x={29} y={26} r={3.4}/><Eye x={42} y={25} r={3.4}/>
    <path fill="#d1a870" d="m34 30 5 1-3 6Z"/>
    <path fill="none" stroke="#8caec2" strokeWidth="2" d="m29 42 4 3 4-3m-10 6 5 2 5-2m7-10 2 2m-20-2 2 2"/>
    <path d="m29 54-4 4h7m7-4 4 4h-7" stroke="#a8947b" fill="none" strokeWidth="2"/>
    <path d="m10 18 11 11m28-6 7-7" stroke="#e4efea" fill="none"/>
  </>,
  'creature:5:2': <>
    <path fill="#8db6cc" d="m18 44-5 14 14 3 4-14m7-3 2 17 15-4-8-14"/>
    <path fill="#add6e1" d="m18 23 13-5 15 7 6 18-12 11-21-5-7-12Z"/>
    <path fill="#d8eef0" stroke="none" d="m21 26 11-4 10 5-9 7-13-1Z"/>
    <path fill="#7faac4" d="m27 34 9-4 6 7-7 12-9-7Z"/>
    <path fill="#e8f8f3" d="m31 35 5 2-3 7-3-4Z"/>
    <path fill="#bfdee8" d="m18 13 9-7 16 2 8 12-7 12-21-2-7-9Z"/>
    <path fill="#e8f5ef" stroke="none" d="m21 13 9-4 10 3 4 7-14-3-7 7Z"/>
    <path fill="#719bb7" d="m23 20 10 2-3 5-7-1m14-5 10-3-1 7-8 2"/>
    <path stroke="#f6fff7" strokeWidth="2" d="m25 24 4 1m12-1 3-1" fill="none"/>
    <path fill="#93bfd2" d="m12 27-9 7 1 15 9 3 8-10-2-11m29-3 11 4 3 14-9 8-10-8-1-11"/>
    <path fill="#d8eff0" d="m9 30-1-13 10 11m35 2 3-16 6 20Z"/>
    <path stroke="#d8edf0" fill="none" d="m6 39 8 2-3 6m40-12 4 9 5-2m-39 13 7 2m15-3 6 2"/>
  </>,
};
