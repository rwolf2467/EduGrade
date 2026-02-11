/**
 * UTILITY FUNCTIONS
 * Shared utility functions used across multiple script files
 */

/**
 * Calculates the current school year based on the current date.
 * School years switch in June, so:
 * - January to May: belongs to the previous school year (e.g., Jan-May 2026 -> 2025/2026)
 * - June to December: belongs to the current school year (e.g., Jun-Dec 2026 -> 2026/2027)
 * @returns {number} The starting year of the current school year
 */
const getCurrentSchoolYear = () => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth(); // 0 = January, 11 = December
    const currentYear = currentDate.getFullYear();
    
    // If current month is January (0) to May (4), we're in the previous school year
    // June (5) and later months belong to the current school year
    if (currentMonth >= 0 && currentMonth <= 4) { // January to May
        return currentYear - 1;
    } else { // June to December
        return currentYear;
    }
};