import React from "react";

interface PaginationProps {
  currentPage: number; // 当前页数
  totalPages: number; // 总页数
  onPageChange: (page: number) => void; // 页面切换的回调函数
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  return (
    <>
      <div className="flex justify-center items-center space-x-4 mt-[30px] mb-[35px] border-none">
        {/* 上一页 */}
        {currentPage > 1 && (
          <button
            className={`border-none bg-[#f7f7f7] text-gray-500 ${currentPage === 1 ? "opacity-50 cursor-not-allowed" : "hover:text-gray-700"}`}
            onClick={handlePrevious}
            disabled={currentPage === 1}
          >
            {" "}
            &larr;{" "}
          </button>
        )}

        {/* 页码 */}
        {Array.from({ length: totalPages }, (_, index) => {
          const page = index + 1;
          return (
            <button
              key={page}
              className={`px-2 py-1 border-none bg-[#f7f7f7] 
                ${ currentPage === page ? "text-red-500 font-bold" : "text-gray-500 hover:text-gray-700" }
                ${ totalPages === 1 ? "hidden" : ""}
                `}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          );
        })}

        {/* 下一页 */}
        {currentPage < totalPages && (
          <button
            className={`border-none bg-[#f7f7f7] text-gray-500 ${currentPage === totalPages ? "opacity-50 cursor-not-allowed" : "hover:text-gray-700"}`}
            onClick={handleNext}
            disabled={currentPage === totalPages}
          >
            &rarr;
          </button>
        )}
      </div>
    </>
  );
};

export default Pagination;
