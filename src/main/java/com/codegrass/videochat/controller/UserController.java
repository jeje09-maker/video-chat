package com.codegrass.videochat.controller;

import com.codegrass.videochat.domain.AppUser;
import com.codegrass.videochat.domain.AppUserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Slf4j
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final AppUserRepository userRepository;

    @PostMapping("/sync")
    public ResponseEntity<?> syncUser(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        String name = payload.get("name");

        if (email == null || email.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Email is required");
        }

        Optional<AppUser> userOpt = userRepository.findById(email);
        if (!userOpt.isPresent()) {
            AppUser newUser = new AppUser(email, name);
            // First user gets admin rights for convenience
            if (userRepository.count() == 0) {
                newUser.setAdmin(true);
            }
            userRepository.save(newUser);
            log.info("Synced new user: {}", email);
        } else {
            AppUser user = userOpt.get();
            if (name != null && !name.equals(user.getName())) {
                user.setName(name);
                userRepository.save(user);
            }
        }
        return ResponseEntity.ok().build();
    }

    @GetMapping("/check-permission")
    public ResponseEntity<Map<String, Boolean>> checkPermission(@RequestParam String email) {
        Map<String, Boolean> response = new HashMap<>();
        Optional<AppUser> userOpt = userRepository.findById(email);
        if (userOpt.isPresent()) {
            response.put("canCreateRoom", userOpt.get().isCanCreateRoom());
        } else {
            // Default to true if user not found (e.g. not synced yet)
            response.put("canCreateRoom", true);
        }
        return ResponseEntity.ok(response);
    }
}
