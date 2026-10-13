/** Returns an Arabic error message, or null when the password is strong enough. */
export function passwordProblem(pw: string): string | null {
  if (!pw || pw.length < 8) return "كلمة المرور يجب أن تكون 8 أحرف على الأقل";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "كلمة المرور يجب أن تحتوي على حروف وأرقام";
  return null;
}
