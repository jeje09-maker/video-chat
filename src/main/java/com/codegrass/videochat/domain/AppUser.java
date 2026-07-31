package com.codegrass.videochat.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Entity
@Table(name = "app_user")
@Getter
@Setter
@NoArgsConstructor
public class AppUser {

    @Id
    private String email;

    private String name;

    private boolean canCreateRoom = true;

    private boolean isAdmin = false;
    
    private long roomCount = 0;

    public AppUser(String email, String name) {
        this.email = email;
        this.name = name;
    }
}
