type OnboardingProfileLike = {
  onboarding_completed?: boolean | null;
  starter_class?: string | null;
};

export function hasCompletedOnboarding(profile: OnboardingProfileLike | null | undefined, userId: string): boolean {
  const doneInDb = profile?.onboarding_completed === true;
  const doneInLocal = localStorage.getItem(`onboarding_v1_${userId}`) === "done";
  const starterClassInDb = typeof profile?.starter_class === "string" && profile.starter_class.trim().length > 0;
  const starterClassInLocal = typeof localStorage.getItem(`starter_class_v1_${userId}`) === "string";

  return doneInDb || doneInLocal || starterClassInDb || starterClassInLocal;
}

export function markOnboardingCompletedLocal(userId: string, starterClass: string, starterItem: string): void {
  localStorage.setItem(`starter_class_v1_${userId}`, starterClass);
  localStorage.setItem(`starter_item_v1_${userId}`, starterItem);
  localStorage.setItem(`onboarding_v1_${userId}`, "done");
}
