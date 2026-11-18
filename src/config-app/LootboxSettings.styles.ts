import styled from "styled-components";

export const Form = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacingGutter};
  padding: ${({ theme }) => theme.spacingGutter};
  font-size: 0.82rem;
`;

export const Columns = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacingGutter};
  align-items: start;
`;

export const Panel = styled.section`
  background: ${({ theme }) => theme.backgroundPanel};
  border: 1px solid ${({ theme }) => theme.borderMuted};
  border-radius: ${({ theme }) => theme.radiusPanel};
  box-shadow: ${({ theme }) => theme.shadowCard};
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const Heading = styled.h3`
  margin: 0;
  border: none;
  color: ${({ theme }) => theme.colourHeading};
  font-size: 0.9rem;
`;

export const Hint = styled.p<{ $warn?: boolean }>`
  margin: 0;
  font-size: 0.72rem;
  color: ${({ theme, $warn }) => ($warn ? theme.colourLoss : theme.colourTextInside)};
`;

export const Grid = styled.table`
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  background: none;
  border: none;

  th,
  td {
    padding: 2px 4px;
    text-align: left;
    border: none;
    font-weight: normal;
  }

  thead th {
    color: ${({ theme }) => theme.colourTextInside};
    font-size: 0.72rem;
    background: ${({ theme }) => theme.backgroundPanel};
    text-shadow: none;
  }

  tbody td:first-child {
    white-space: nowrap;
  }

  tbody tr:nth-child(odd) {
    background: ${({ theme }) => theme.backgroundRowEven};
  }

  input[type="number"] {
    width: 100%;
    min-width: 0;
    height: 22px;
    padding: 0 4px;
    text-align: right;
    color: ${({ theme }) => theme.colourTextOnLight};
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid ${({ theme }) => theme.borderMuted};
    border-radius: ${({ theme }) => theme.radiusControl};
  }

  input[type="number"]:focus {
    border-color: ${({ theme }) => theme.colourHeading};
    outline: none;
  }

  .share,
  .num {
    text-align: right;
    white-space: nowrap;
    color: ${({ theme }) => theme.colourTextInside};
  }

  .off {
    color: ${({ theme }) => theme.colourLoss};
    font-weight: bold;
  }
`;

export const Footer = styled.div`
  display: flex;
  gap: 8px;
  position: sticky;
  bottom: 0;
  padding: 8px 0 0;
  background: ${({ theme }) => theme.gradient4e};

  button {
    flex: 1;
    margin: 0;
  }
`;
