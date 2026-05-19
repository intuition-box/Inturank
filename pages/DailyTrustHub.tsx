import React from 'react';
import { Navigate } from 'react-router-dom';
import { FLAGSHIP_ARENA_LIST_ID } from '../services/intuRankProductSpec';

/**
 * Trust picks onboarding lives on the Arena so the flow is one place.
 * Keeps `/hub/trust-tools` bookmarks working without a sparse standalone page.
 */
const DailyTrustHub: React.FC = () => (
  <Navigate to={`/climb?list=${FLAGSHIP_ARENA_LIST_ID}&onboard=1`} replace />
);

export default DailyTrustHub;
