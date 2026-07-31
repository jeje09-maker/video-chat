package com.codegrass.videochat.controller;

import com.codegrass.videochat.domain.AppUser;
import com.codegrass.videochat.domain.AppUserRepository;
import com.codegrass.videochat.domain.RoomHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Controller
@RequiredArgsConstructor
public class AdminController {

    private final AppUserRepository userRepository;
    private final RoomHistoryRepository roomHistoryRepository;

    // 수퍼관리자 이메일 (하드코딩, 절대 변경 불가)
    private static final java.util.Set<String> SUPER_ADMINS =
        java.util.Collections.unmodifiableSet(
            new java.util.HashSet<>(java.util.Arrays.asList("jeje09@nate.com", "jeje09@daum.net")));

    @GetMapping("/admin")
    public String adminPage(Model model) {
        List<AppUser> users = userRepository.findAll();

        long totalRooms = roomHistoryRepository.count();
        Long totalUsageMinutes = roomHistoryRepository.getTotalUsageMinutes();
        if (totalUsageMinutes == null) totalUsageMinutes = 0L;

        List<Map<String, Object>> topCreators = roomHistoryRepository.findTopCreators();
        String topCreator = "없음";
        if (!topCreators.isEmpty()) {
            topCreator = String.valueOf(topCreators.get(0).get("email"));
        }

        model.addAttribute("users", users);
        model.addAttribute("totalRooms", totalRooms);
        model.addAttribute("totalUsageMinutes", totalUsageMinutes);
        model.addAttribute("topCreator", topCreator);
        model.addAttribute("superAdmins", SUPER_ADMINS);

        return "admin";
    }

    @PostMapping("/admin/toggle-permission")
    public String togglePermission(@RequestParam String email) {
        Optional<AppUser> userOpt = userRepository.findById(email);
        if (userOpt.isPresent()) {
            AppUser user = userOpt.get();
            user.setCanCreateRoom(!user.isCanCreateRoom());
            userRepository.save(user);
        }
        return "redirect:/admin";
    }

    @PostMapping("/admin/toggle-admin")
    public String toggleAdmin(@RequestParam String email) {
        // 수퍼관리자는 변경 불가
        if (SUPER_ADMINS.contains(email)) {
            log.warn("수퍼관리자 권한 변경 시도 차단: {}", email);
            return "redirect:/admin";
        }
        Optional<AppUser> userOpt = userRepository.findById(email);
        if (userOpt.isPresent()) {
            AppUser user = userOpt.get();
            user.setAdmin(!user.isAdmin());
            userRepository.save(user);
            log.info("관리자 권한 변경: {} -> {}", email, user.isAdmin() ? "관리자" : "일반");
        }
        return "redirect:/admin";
    }
}
