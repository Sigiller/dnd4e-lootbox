import styled, { css } from "styled-components";

export const Inner = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacingGutter};
  padding: ${({ theme }) => theme.spacingGutter};
`;

export const Panel = styled.section`
  background: ${({ theme }) => theme.backgroundPanel};
  border: 1px solid ${({ theme }) => theme.borderMuted};
  border-radius: ${({ theme }) => theme.radiusPanel};
  box-shadow: ${({ theme }) => theme.shadowCard};
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const Heading = styled.h3`
  margin: 0;
  border: none;
  color: ${({ theme }) => theme.colourHeading};
  font-size: 0.95rem;
`;

export const Row = styled.label`
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;

  select {
    width: 100%;
  }
`;

export const CheckRow = styled.label<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  ${({ $disabled }) =>
    $disabled &&
    css`
      opacity: 0.55;
    `}
`;

export const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
`;

export const Stat = styled.div<{ $tone: "loss" | "sell" | "value" }>`
  border-radius: ${({ theme }) => theme.radiusControl};
  padding: 4px 6px;
  text-align: center;
  color: ${({ theme }) => theme.colourTextOnDark};
  background: ${({ theme, $tone }) =>
    $tone === "loss" ? theme.colourLoss : $tone === "sell" ? theme.colourSell : theme.colourMarket};

  strong {
    display: block;
    font-size: 1rem;
  }

  span {
    font-size: 0.7rem;
  }
`;

export const Note = styled.p<{ $warn?: boolean }>`
  margin: 0;
  font-size: 0.75rem;
  color: ${({ theme, $warn }) => ($warn ? theme.colourLoss : theme.colourTextInside)};
`;

export const Actions = styled.div`
  display: flex;
  gap: 8px;

  button {
    flex: 1;
    margin: 0;
  }
`;

export const SecondaryButton = styled.button`
  flex: 0 0 auto !important;
  font-size: 0.75rem;
`;
