import React, { createContext, useContext } from 'react';

export const SessionModalContext = createContext({
  openSessionModal: () => {},
  closeSessionModal: () => {},
  isSessionModalOpen: false,
  sessionModalStudentId: null,
});

export function useSessionModal() {
  return useContext(SessionModalContext);
}
