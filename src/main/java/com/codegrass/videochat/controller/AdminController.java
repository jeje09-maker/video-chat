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
}
