import type { ProgramListResponse } from './programs';
import { mockProgramList } from '../mock/programs';

export function getMockProgramsResponse(): ProgramListResponse {
  return structuredClone(mockProgramList);
}

export const MOCK_PROGRAMS_RESPONSE = mockProgramList;
