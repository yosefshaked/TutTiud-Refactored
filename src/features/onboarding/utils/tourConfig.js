// Tour configuration for react-joyride
export const tourConfig = {
  continuous: true,
  scrollToFirstStep: true,
  showProgress: true,
  showSkipButton: true,
  disableOverlayClose: false,
  disableCloseOnEsc: false,
  spotlightClicks: false,
  styles: {
    options: {
      primaryColor: '#2563EB',
      textColor: '#333',
      backgroundColor: '#fff',
      overlayColor: 'rgba(0, 0, 0, 0.5)',
      arrowColor: '#fff',
      width: 400,
      zIndex: 10000,
    },
    tooltip: {
      borderRadius: '8px',
      padding: '20px',
    },
    tooltipContainer: {
      textAlign: 'right', // RTL support
    },
    buttonNext: {
      backgroundColor: '#2563EB',
      borderRadius: '8px',
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: 'bold',
    },
    buttonBack: {
      color: '#666',
      marginLeft: '10px',
    },
    buttonSkip: {
      color: '#999',
    },
  },
  locale: {
    back: 'הקודם',
    close: 'סגור',
    last: 'סיום',
    next: 'הבא',
    skip: 'דלג',
  },
};
