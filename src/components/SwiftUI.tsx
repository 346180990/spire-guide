// components/Stack.tsx
import React, { PropsWithChildren } from "react";

type StackProps = PropsWithChildren<{
  spacing?: string; // 间距，例如 "4", "8"
  className?: string; // 自定义样式
}>;

export const VStack: React.FC<StackProps> = ({
  spacing = "4",
  className = "",
  children,
}) => {
  return (
    <div className={`flex flex-col space-y-${spacing} ${className}`}>
      {children}
    </div>
  );
};

export const HStack: React.FC<StackProps> = ({
  spacing = "4",
  className = "",
  children,
}) => {
  return (
    <div className={`flex flex-row space-x-${spacing} ${className}`}>
      {children}
    </div>
  );
};

export const Spacer: React.FC<{ className?: string }> = ({
  className = "",
}) => {
  return <div className={`flex-grow ${className}`}></div>;
};
