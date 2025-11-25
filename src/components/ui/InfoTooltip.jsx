import React from 'react';
import styled from 'styled-components';

const InfoTooltip = ({ message, side = 'top' }) => {
  return (
    <StyledWrapper>
      <button className="info-button">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512">
          <path d="M80 160c0-35.3 28.7-64 64-64h32c35.3 0 64 28.7 64 64v3.6c0 21.8-11.1 42.1-29.4 53.8l-42.2 27.1c-25.2 16.2-40.4 44.1-40.4 74V320c0 17.7 14.3 32 32 32s32-14.3 32-32v-1.4c0-8.2 4.2-15.8 11-20.2l42.2-27.1c36.6-23.6 58.8-64.1 58.8-107.7V160c0-70.7-57.3-128-128-128H144C73.3 32 16 89.3 16 160c0 17.7 14.3 32 32 32s32-14.3 32-32zm80 320a40 40 0 1 0 0-80 40 40 0 1 0 0 80z" />
        </svg>
        <span className="tooltip">{message}</span>
      </button>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  .info-button {
    width: 25px;
    height: 25px;
    border-radius: 50%;
    border: none;
    background-color: #60a5fa;
    background-image: linear-gradient(147deg, #60a5fa 0%, #2563eb 74%);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    box-shadow: 0px 5px 5px rgba(0, 0, 0, 0.151);
    position: relative;
  }
  
  .info-button svg {
    height: 0.75em;
    fill: white;
  }
  
  .info-button:hover svg {
    animation: jello-vertical 0.7s both;
  }
  
  @keyframes jello-vertical {
    0% {
      transform: scale3d(1, 1, 1);
    }
    30% {
      transform: scale3d(0.75, 1.25, 1);
    }
    40% {
      transform: scale3d(1.25, 0.75, 1);
    }
    50% {
      transform: scale3d(0.85, 1.15, 1);
    }
    65% {
      transform: scale3d(1.05, 0.95, 1);
    }
    75% {
      transform: scale3d(0.95, 1.05, 1);
    }
    100% {
      transform: scale3d(1, 1, 1);
    }
  }

  .tooltip {
    position: absolute;
    top: -10px;
    opacity: 0;
    background-color: #60a5fa;
    background-image: linear-gradient(147deg, #60a5fa 0%, #2563eb 74%);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition-duration: 0.2s;
    pointer-events: none;
    letter-spacing: 0.5px;
    font-size: 12px;
    white-space: nowrap;
    z-index: 10000;
  }

  .tooltip::before {
    position: absolute;
    content: "";
    width: 5px;
    height: 5px;
    background-color: #2563eb;
    background-size: 1000%;
    background-position: center;
    transform: rotate(45deg);
    bottom: -7.5%;
    transition-duration: 0.3s;
  }

  .info-button:hover .tooltip {
    top: -30px;
    opacity: 1;
    transition-duration: 0.3s;
  }
`;

export default InfoTooltip;
