import React from "react";
import { DepartmentIdentity } from "../../data/departments";

interface DepartmentLogoProps {
  department: DepartmentIdentity;
  size?: number;
  showLabel?: boolean;
}

export const DepartmentLogo: React.FC<DepartmentLogoProps> = ({
  department,
  size = 40,
  showLabel = false,
}) => {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="rounded-xl overflow-hidden border shrink-0 flex items-center justify-center"
        style={{
          width: size,
          height: size,
          borderColor: department.accentColor + "55",
          backgroundColor: department.primaryColor + "22",
        }}
        title={`${department.fullName} — ${department.motto}`}
      >
        <div
          style={{ width: size - 4, height: size - 4 }}
          dangerouslySetInnerHTML={{ __html: department.emblemSvg }}
        />
      </div>
      {showLabel && (
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-100 truncate leading-tight">
            {department.shortName}
          </div>
          <div className="text-[10px] text-slate-400 truncate leading-tight">
            {department.fullName}
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentLogo;
